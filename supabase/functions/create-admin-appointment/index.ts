// @ts-nocheck
// supabase/functions/create-admin-appointment/index.ts
// Create personal appointment in Google Calendar
// The gcal-sync function will automatically sync it to the database
// =================================================================

// ---------- ACCESS TOKEN LOGIC ----------
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar";

function b64url(s: string) {
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function convertTo24Hour(timeStr: string) {
  // Example: "03:00 PM"
  const [time, modifier] = timeStr.split(" ");
  let [hours, minutes] = time.split(":").map(Number);

  if (modifier === "PM" && hours !== 12) {
      hours += 12;
  }
  if (modifier === "AM" && hours === 12) {
      hours = 0;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

async function getAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON");
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: GCAL_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const pem = sa.private_key as string;
  if (!pem) throw new Error("Service account JSON missing private_key");
  const pkcs8 = pem.replace(/-----.*?-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pkcs8), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
  const jwt = `${data}.${b64url(String.fromCharCode(...new Uint8Array(sig)))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const tok = await res.json();
  if (!tok.access_token) throw new Error("Token error: " + JSON.stringify(tok));
  return tok.access_token;
}

// ---------- CORS HEADERS ----------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- MAIN FUNCTION ----------
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, date, startTime, endTime, location } = await req.json();

    // Validate required fields
    if (!title || !date || !startTime) {
      return new Response(
        JSON.stringify({ error: "Title, date, and start time are required" }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            ...corsHeaders 
          } 
        }
      );
    }

    // Build local datetime strings (no UTC conversion)
    let finalEndTime = endTime;

    if (!finalEndTime) {
        // Default duration = 1 hour
        const [startHourStr, startMinuteStr] = startTime.split(':');
        const startHour = parseInt(startHourStr, 10);
        const startMinute = parseInt(startMinuteStr, 10);
        
        const totalMinutes = startHour * 60 + startMinute + 60; // +60 mins
        const endHour = Math.floor(totalMinutes / 60);
        const endMinute = totalMinutes % 60;
        
        const endHourPadded = String(endHour).padStart(2, '0');
        const endMinutePadded = String(endMinute).padStart(2, '0');
        
        finalEndTime = `${endHourPadded}:${endMinutePadded}`;
    }

    // Convert 12-hour UI time to 24-hour time
    const start24 = convertTo24Hour(startTime);
    const end24 = finalEndTime ? convertTo24Hour(finalEndTime) : null;
    
    // Build final ISO with explicit local timezone (no UTC conversion)
    const startISO = `${date}T${start24}:00`;
    const endISO   = `${date}T${end24}:00`;

    console.log("[create-admin-appointment] Creating event:", { title, startISO, endISO, location });

    // Get Google Calendar access token
    const token = await getAccessToken();

    // Get calendar ID from env
    const calendarId = Deno.env.get("GCAL_CALENDAR_IDS")?.split(",")[0]?.trim() || 
                      "darren@automandrivingschool.com.au";

    // Create Google Calendar event
    const eventBody = {
      summary: title,
      description: "", // Empty for personal appointments
      start: { 
        dateTime: startISO, 
        timeZone: "Australia/Melbourne" 
      },
      end: { 
        dateTime: endISO, 
        timeZone: "Australia/Melbourne" 
      },
      location: location || undefined,
    };

    const gcalRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      }
    );

    if (!gcalRes.ok) {
      const errorText = await gcalRes.text();
      console.error("[create-admin-appointment] Google Calendar API error:", gcalRes.status, errorText);
      return new Response(
        JSON.stringify({ error: "Could not save appointment in Google Calendar. Please try again." }),
        { 
          status: 500, 
          headers: { 
            "Content-Type": "application/json",
            ...corsHeaders 
          } 
        }
      );
    }

    const event = await gcalRes.json();
    console.log("[create-admin-appointment] ✓ Google event created:", event.id);
    console.log("[create-admin-appointment] Event will be synced to database via gcal-sync");

    return new Response(
      JSON.stringify({ ok: true, googleEvent: event }),
      { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        } 
      }
    );

  } catch (err) {
    console.error("[create-admin-appointment] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        } 
      }
    );
  }
});
