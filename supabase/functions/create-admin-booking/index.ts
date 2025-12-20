// @ts-nocheck
// supabase/functions/create-admin-booking/index.ts
// Create admin booking in Google Calendar
// The gcal-sync function will automatically sync it to the database
// =================================================================

// ---------- ACCESS TOKEN LOGIC ----------
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar";

function b64url(s: string) {
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function convertTo24Hour(timeStr: string): string {
  // Example input: "03:00 PM"
  const [time, modifier] = timeStr.split(" ");
  let [hoursStr, minutesStr] = time.split(":");
  let hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;

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

// ---------- SERVICE DURATION TABLE ----------
const SERVICE_DURATION_MINUTES: Record<string, number> = {
  auto_60: 60,
  auto_90: 90,
  auto_120: 120,
};

// ---------- CORS HEADERS ----------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- CANCELLATION POLICY TEXT ----------
const CANCELLATION_POLICY_HTML = `<br><b>Cancellation policy</b>
<p>Cancellations made <b>24 hours or more</b> before the lesson will receive a full refund.<br>Cancellations made with <b>less than 24 hours' notice</b> are <b>non-refundable</b>, as the lesson time cannot be rebooked at short notice.<br>If you need to reschedule, please contact us as early as possible to avoid losing your payment.</p>`;

const SERVICE_DESCRIPTION = `<br>Patient, friendly driving lessons in Geelong. Learn at your own pace with qualified instructors and dual-control vehicles. Pickup available from your preferred address within our Geelong service area.`;

// ---------- MAIN FUNCTION ----------
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const {
      appointmentType,
      serviceCode,
      serviceLabel,
      date,
      startTime,
      endTime,
      clientId,
      firstName,
      lastName,
      email,
      mobile,
      pickupLocation,
      isPaymentRequired,
    } = payload;

    console.log("[create-admin-booking] Received payload:", JSON.stringify(payload, null, 2));

    // Validate required fields
    if (appointmentType !== "booking") {
      return new Response(
        JSON.stringify({ error: "Invalid appointment type. Expected 'booking'." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!serviceCode || !serviceLabel || !date || !startTime || !email || !mobile || !pickupLocation) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: serviceCode, serviceLabel, date, startTime, email, mobile, pickupLocation" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate that either clientId OR firstName is provided
    if (!clientId && !firstName) {
      return new Response(
        JSON.stringify({ error: "Either clientId or firstName must be provided" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Convert 12-hour UI time to 24-hour time
    const start24 = convertTo24Hour(startTime);

    // Determine end time
    let end24: string;
    if (endTime) {
      end24 = convertTo24Hour(endTime);
    } else {
      // Calculate from service duration
      const [hStr, mStr] = start24.split(":");
      const startMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
      const delta = SERVICE_DURATION_MINUTES[serviceCode] ?? 60;
      const totalMinutes = startMinutes + delta;
      const endH = Math.floor(totalMinutes / 60);
      const endM = totalMinutes % 60;
      end24 = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    }

    // Build local datetime strings (NO toISOString, NO Z)
    const startISO = `${date}T${start24}:00`;
    const endISO = `${date}T${end24}:00`;

    console.log("[create-admin-booking] Time conversion:", { startTime, start24, startISO, endTime, end24, endISO });

    // Build client name with trim to handle whitespace
    const clientFirstName = firstName?.trim() || "";
    const clientLastName = lastName?.trim() || "";
    
    const clientName = [clientFirstName, clientLastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    // Build event summary to match Google Scheduling format: "Service (Client Name)"
    const summary = clientName ? `${serviceLabel} (${clientName})` : serviceLabel;

    // Build description with safe fallbacks
    const bookedByLabel = clientName || 'Admin booking';
    const safeEmail = email || 'No email provided';
    const safeMobile = mobile || 'None';
    const safePickup = pickupLocation || 'Pickup location';

    const description =
      `<b>Booked by</b>\n` +
      `${bookedByLabel}\n` +
      `${safeEmail}\n` +
      `<br><b>Mobile</b>\n` +
      `${safeMobile}\n` +
      CANCELLATION_POLICY_HTML + `\n` +
      SERVICE_DESCRIPTION;

    // Get Google Calendar access token
    const token = await getAccessToken();

    // Get calendar ID from env (same as bookings calendar)
    const calendarId = Deno.env.get("GCAL_CALENDAR_IDS")?.split(",")[0]?.trim() || 
                      "darren@automandrivingschool.com.au";

    console.log("[create-admin-booking] Using calendar:", calendarId);

    // Build event body with extended properties
    // NOTE: No attendees array - service accounts cannot invite attendees without Domain-Wide Delegation
    const eventBody = {
      summary,
      description,
      location: pickupLocation || '', // Empty if not provided to avoid misleading map info
      start: {
        dateTime: startISO,
        timeZone: "Australia/Melbourne",
      },
      end: {
        dateTime: endISO,
        timeZone: "Australia/Melbourne",
      },
      extendedProperties: {
        shared: {
          service_code: serviceCode,
          created_by: "admin",
          is_payment_required: isPaymentRequired ? "true" : "false",
          is_booking: "true", // Mark as booking so gcal-sync colors it correctly
          mobile: safeMobile, // Stable source - immune to Google UI description corruption
          pickup_location: safePickup, // Stable source - immune to Google UI description corruption
        },
      },
    };

    console.log("[create-admin-booking] Creating Google Calendar event:", JSON.stringify(eventBody, null, 2));

    // Create Google Calendar event
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
      console.error("[create-admin-booking] Google Calendar API error:", gcalRes.status, errorText);
      return new Response(
        JSON.stringify({ error: "Could not create booking in Google Calendar. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const googleEvent = await gcalRes.json();
    console.log("[create-admin-booking] ✓ Google event created:", googleEvent.id);
    console.log("[create-admin-booking] Event will be synced to database via gcal-sync");

    return new Response(
      JSON.stringify({ ok: true, googleEvent }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (err) {
    console.error("[create-admin-booking] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
