// @ts-nocheck: Edge Function runs in Deno with dynamic request/env shapes; keep type checking off for this file.
// supabase/functions/create-admin-appointment/index.ts
// Create personal appointment in Google Calendar
// The gcal-sync function will automatically sync it to the database
// =================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------- ACCESS TOKEN LOGIC ----------
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";

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

function addDaysToDate(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function requireAdmin(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing env: SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) {
    return { ok: false, status: 401, error: "Missing Authorization header" };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "Invalid session" };
  }

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr) {
    return { ok: false, status: 500, error: "Admin check failed" };
  }

  if (isAdmin !== true) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, status: 200 };
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// ---------- MAIN FUNCTION ----------
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return new Response(
      JSON.stringify({ error: admin.error }),
      {
        status: admin.status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
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

    // Convert 12-hour UI time to 24-hour time first
    const start24 = convertTo24Hour(startTime);

    // Start minutes
    const [sh, sm] = start24.split(":").map(Number);
    const startMins = sh * 60 + sm;

    let end24: string;
    let endDate = date;

    if (endTime) {
      const endCandidate24 = convertTo24Hour(endTime);
      const [eh, em] = endCandidate24.split(":").map(Number);
      const endMins = eh * 60 + em;

      // If end time is earlier than (or same as) start time, assume it crosses midnight
      if (endMins <= startMins) {
        endDate = addDaysToDate(date, 1);
      }

      end24 = endCandidate24;
    } else {
      // Default duration = 1 hour
      const totalMinutes = startMins + 60;

      if (totalMinutes >= 24 * 60) {
        endDate = addDaysToDate(date, 1);
      }

      const endMins = totalMinutes % (24 * 60);
      const endHour = Math.floor(endMins / 60);
      const endMinute = endMins % 60;
      end24 = `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
    }

    // Build final ISO (local date/time strings)
    const startISO = `${date}T${start24}:00`;
    const endISO   = `${endDate}T${end24}:00`;

    console.log("[create-admin-appointment] Creating event:", { title, startISO, endISO, location });

    // Get Google Calendar access token
    const token = await getAccessToken();

    // Get calendar ID from env (required)
    const calendarIdRaw = Deno.env.get("GCAL_CALENDAR_IDS");
    if (!calendarIdRaw) throw new Error("Missing env: GCAL_CALENDAR_IDS");
    const calendarId = calendarIdRaw.split(",")[0].trim();

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
      extendedProperties: {
        shared: {
          is_booking: "false"
        }
      }
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

    // Immediately insert booking record into database (don't wait for webhook)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("[create-admin-appointment] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      // Return success anyway - webhook will eventually sync it
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
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Prepare booking data
    const bookingData = {
      google_event_id: event.id,
      google_calendar_id: calendarId,
      // Store as UTC ISO for timestamptz
      start_time: event?.start?.dateTime ? new Date(event.start.dateTime).toISOString() : new Date(startISO).toISOString(),
      end_time: event?.end?.dateTime ? new Date(event.end.dateTime).toISOString() : new Date(endISO).toISOString(),
      status: 'confirmed',
      source: 'google',
      is_booking: false,
      event_title: title,
      pickup_location: location || null,
      google_html_link: event.htmlLink || null,
      google_ical_uid: event.iCalUID || null,
    };

    console.log("[create-admin-appointment] Inserting booking record:", bookingData);
    
    const { data: bookingRecord, error: bookingError } = await supabase
      .from('booking')
      .upsert(bookingData, { onConflict: 'google_event_id' })
      .select('id')
      .maybeSingle();

    if (bookingError) {
      console.error("[create-admin-appointment] Failed to insert booking:", bookingError);
      // Return success anyway - webhook will eventually sync it
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
    }

    console.log("[create-admin-appointment] ✓ Booking record created:", bookingRecord.id);

    return new Response(
      JSON.stringify({ ok: true, googleEvent: event, bookingId: bookingRecord.id }),
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
