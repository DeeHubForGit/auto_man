// @ts-nocheck: Edge Functions run in Deno with dynamic env/request shapes; keep type checking off for this file.
// supabase/functions/update-admin-booking/index.ts
// Update booking in Google Calendar and database
// =====================================================

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

function getPrimaryCalendarId(): string {
  const raw = Deno.env.get("GCAL_CALENDAR_IDS") || "";
  if (!raw) throw new Error("Missing GCAL_CALENDAR_IDS env var");

  // Try JSON first
  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed) && parsed.length > 0) {
      return String(parsed[0]);
    }

    if (parsed && typeof parsed === "object") {
      const values = Object.values(parsed as Record<string, unknown>);
      if (values.length > 0) return String(values[0]);
    }
  } catch (_e) {
    // Not JSON, treat as raw string
  }

  // Plain string (single calendar id)
  return raw.split(",")[0].trim();
}

// ---------- MAIN FUNCTION ----------
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const admin = await requireAdmin(req);
    if (!admin.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: admin.error }),
        {
          status: admin.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const payload = await req.json();
    const { 
      bookingId,
      googleEventId,
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
      pickupLocation
    } = payload;
    
    const isPaidBool = !!(payload?.isPaid ?? payload?.is_paid);

    // Validate required fields
    if (!bookingId || !googleEventId || !serviceCode || !date || !startTime) {
      return new Response(
        JSON.stringify({ ok: false, error: "Booking ID, Google Event ID, service, date, and start time are required" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    console.log("[update-admin-booking] Updating booking:", bookingId);

    // Convert 12-hour time to 24-hour
    const start24 = convertTo24Hour(startTime);
    const end24 = endTime ? convertTo24Hour(endTime) : start24;

    // Midnight rollover: if end time is earlier than (or same as) start time, assume it crosses midnight
    const [sh, sm] = start24.split(":").map(Number);
    const startMins = sh * 60 + sm;
    let endDate = date;

    if (endTime) {
      const [eh, em] = end24.split(":").map(Number);
      const endMins = eh * 60 + em;
      if (endMins <= startMins) {
        endDate = addDaysToDate(date, 1);
      }
    }

    // Build ISO timestamps
    const startDateTime = `${date}T${start24}:00`;
    const endDateTime = `${endDate}T${end24}:00`;

    // Get calendar ID from env (supports JSON array/object or plain string)
    const calendarId = getPrimaryCalendarId();

    // Get access token
    const accessToken = await getAccessToken();

    // Build client name
    const clientName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown Client';

    // Build event description with booking details
    const description = `
<b>Service</b>
${serviceLabel || serviceCode}

<b>Client</b>
${clientName}

<b>Email</b>
${email || 'N/A'}

<b>Mobile</b>
${mobile || 'N/A'}

<b>Pickup Address</b>
${pickupLocation || 'N/A'}
`.trim();

    // Build event summary
    const summary = `${serviceLabel || serviceCode} - ${clientName}`;

    // Fetch existing event so we can merge extendedProperties (avoid clobbering other flags)
    const existingUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`;
    const existingRes = await fetch(existingUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    let existingEvent: unknown = null;
    if (existingRes.ok) {
      try {
        existingEvent = await existingRes.json();
      } catch (_e) {
        existingEvent = null;
      }
    } else {
      const errTxt = await existingRes.text();
      console.warn("[update-admin-booking] Could not fetch existing event for merge:", existingRes.status, errTxt);
    }

    const existingShared = (existingEvent as { extendedProperties?: { shared?: Record<string, unknown> } })
      ?.extendedProperties?.shared || {};
    const existingPrivate = (existingEvent as { extendedProperties?: { private?: Record<string, unknown> } })
      ?.extendedProperties?.private || {};

    // Remove legacy payment-required keys (do not write these back)
    delete (existingShared as Record<string, unknown>)['is_payment_required'];
    delete (existingPrivate as Record<string, unknown>)['isPaymentRequired'];

    // Update the Google Calendar event
    const eventPayload = {
      summary: summary,
      description: description,
      start: { dateTime: startDateTime, timeZone: "Australia/Melbourne" },
      end: { dateTime: endDateTime, timeZone: "Australia/Melbourne" },
      location: (pickupLocation ?? '').toString(),
      structuredLocation: null,
      extendedProperties: {
        shared: {
          ...existingShared,
          // gcal-sync uses these as source of truth
          pickup_location: pickupLocation || '',
          mobile: mobile || '',
          service_code: serviceCode || '',
        },
        private: {
          ...existingPrivate,
          bookingId: bookingId.toString(),
          serviceCode: serviceCode,
          clientEmail: email || '',
          pickup: pickupLocation || '',
        }
      }
    };

    console.log("[update-admin-booking] Updating Google Calendar event:", googleEventId);
    
    const updateUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`;
    const updateRes = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventPayload),
    });

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      console.error("[update-admin-booking] Failed to update Google Calendar event:", errorText);
      throw new Error(`Google Calendar API error: ${updateRes.status} ${errorText}`);
    }

    const updatedEvent = await updateRes.json();
    console.log("[update-admin-booking] ✅ Google Calendar event updated:", updatedEvent.id);

    // Update the booking in the database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: existingBooking, error: existingErr } = await supabase
      .from('booking')
      .select('is_admin_booking')
      .eq('id', bookingId)
      .maybeSingle();

    if (existingErr) {
      console.warn('[update-admin-booking] Failed to read existing booking for payment guard:', existingErr);
    }

    const canEditPayments = existingBooking?.is_admin_booking === true;

    // Build ISO timestamps for database using Google’s returned dateTime (includes correct offset/DST)
    const startIso = updatedEvent?.start?.dateTime
      ? new Date(updatedEvent.start.dateTime).toISOString()
      : new Date(startDateTime).toISOString();
    const endIso = updatedEvent?.end?.dateTime
      ? new Date(updatedEvent.end.dateTime).toISOString()
      : new Date(endDateTime).toISOString();

    // Handle client creation if new client
    let finalClientId = clientId;
    if (!clientId && email) {
      // Check if client exists by email
      const { data: existingClient } = await supabase
        .from('client')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existingClient) {
        finalClientId = existingClient.id;
      } else {
        // Create new client
        const { data: newClient, error: clientError } = await supabase
          .from('client')
          .insert({
            first_name: firstName,
            last_name: lastName,
            email: email,
            mobile: mobile,
          })
          .select('id')
          .single();

        if (clientError) {
          console.error("[update-admin-booking] Failed to create client:", clientError);
        } else if (newClient) {
          finalClientId = newClient.id;
          console.log("[update-admin-booking] Created new client:", newClient.id);
        }
      }
    }

    const updateData: any = {
      service_code: serviceCode,
      start_time: startIso,
      end_time: endIso,
      start_date: date,
      timezone: "Australia/Melbourne",
      pickup_location: pickupLocation || null,
      client_id: finalClientId || null,
      first_name: firstName || null,
      last_name: lastName || null,
      email: email || null,
      mobile: mobile || null,
    };

    if (canEditPayments) {
      updateData.is_paid = isPaidBool;
    }

    const { error: dbError } = await supabase
      .from('booking')
      .update(updateData)
      .eq('id', bookingId);

    if (dbError) {
      console.error("[update-admin-booking] Failed to update booking in database:", dbError);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Failed to update booking in database",
          details: dbError,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      console.log("[update-admin-booking] ✅ Booking updated in database");
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        googleEvent: updatedEvent,
        bookingId: bookingId 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("[update-admin-booking] Error:", error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error?.message || String(error) 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
