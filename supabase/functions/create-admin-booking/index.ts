// @ts-nocheck: Edge Function runs in Deno with dynamic request/env shapes; keep type checking off for this file.
// supabase/functions/create-admin-booking/index.ts
// Create admin booking in Google Calendar
// The gcal-sync function will automatically sync it to the database
// =================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// ---------- SERVICE DURATION TABLE ----------
const SERVICE_DURATION_MINUTES: Record<string, number> = {
  auto_60: 60,
  auto_90: 90,
  auto_120: 120,
  manual_60: 60,
  manual_90: 90,
  manual_120: 120,
  senior_auto_60: 60,
  senior_auto_90: 90,
  senior_auto_120: 120,
  senior_manual_60: 60,
  senior_manual_90: 90,
  senior_manual_120: 120,
};

// ---------- CORS HEADERS ----------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
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

  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return new Response(
      JSON.stringify({ error: admin.error }),
      { status: admin.status, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
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
    } = payload;

    const isPaidBool = !!(payload?.isPaid ?? payload?.is_paid);

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
      // Calculate from service duration
      const delta = SERVICE_DURATION_MINUTES[serviceCode] ?? 60;
      const totalMinutes = startMins + delta;

      if (totalMinutes >= 24 * 60) {
        endDate = addDaysToDate(date, 1);
      }

      const endMins = totalMinutes % (24 * 60);
      const endH = Math.floor(endMins / 60);
      const endM = endMins % 60;
      end24 = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    }

    // Build local datetime strings (NO toISOString, NO Z) for Google payload
    const startISO = `${date}T${start24}:00`;
    const endISO = `${endDate}T${end24}:00`;

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
      `<br><b>Pickup Address</b>\n` +
      `${safePickup}\n` +
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

    // Immediate DB upsert so the UI can show the booking without waiting for gcal-sync
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const adminSupa = createClient(supabaseUrl, serviceRoleKey);

    // Store times as UTC ISO for timestamptz columns
    const startUtc = googleEvent?.start?.dateTime
      ? new Date(googleEvent.start.dateTime).toISOString()
      : new Date(startISO).toISOString();

    const endUtc = googleEvent?.end?.dateTime
      ? new Date(googleEvent.end.dateTime).toISOString()
      : new Date(endISO).toISOString();

    const bookingRow: any = {
      google_event_id: googleEvent.id,
      google_calendar_id: calendarId,
      source: "google",
      status: "confirmed",
      is_booking: true,
      is_admin_booking: true,
      is_paid: isPaidBool,

      service_code: serviceCode,
      start_time: startUtc,
      end_time: endUtc,
      pickup_location: pickupLocation || null,

      event_title: googleEvent.summary || summary || null,
      first_name: clientFirstName || null,
      last_name: clientLastName || null,
      email: email || null,
      mobile: mobile || null,

      google_html_link: googleEvent.htmlLink || null,
      google_ical_uid: googleEvent.iCalUID || null,
    };

    const { data: upserted, error: upsertErr } = await adminSupa
      .from("booking")
      .upsert(bookingRow, { onConflict: "google_event_id" })
      .select("id")
      .maybeSingle();

    if (upsertErr) {
      console.warn("[create-admin-booking] DB upsert failed (sync will still fix it):", upsertErr);
    }

    const bookingId = upserted?.id || null;

    return new Response(
      JSON.stringify({ ok: true, googleEvent, bookingId }),
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
