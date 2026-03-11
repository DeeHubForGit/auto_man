// @ts-nocheck
// Send owner alert SMS when a new real booking is created
// Usage (server-to-server): POST /functions/v1/new-booking-owner-sms
// Body: { booking_id?: string, google_event_id?: string }
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_MOBILE, SMS_SENDER (optional)
//
// NOTE: SMS exclusions (SMS_EXCLUDE_MOBILES) do NOT apply to owner alerts.
// Owner alerts are operational notifications, not customer-facing messages.
// However, they are controlled by booking-level SMS enablement (is_sms_enabled).
// Test bookings can still send owner alerts when SMS is enabled (with [TEST] prefix).
// Also subject to business rules: already sent, not a booking, not confirmed,
// not initial create. Dry_run mode (SMS_ENABLED=false) will also skip sending.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { parseAuMobile } from "../_shared/mobile.ts";

type Json = Record<string, unknown>;

function json(body: Json, init: number | ResponseInit = 200) {
  const initObj = typeof init === "number" ? { status: init } : init;
  return new Response(JSON.stringify(body), {
    ...initObj,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers":
        "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
      ...(initObj as ResponseInit).headers || {},
    },
  });
}

async function fetchJson(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  try {
    return { res, data: JSON.parse(text) as Json, raw: text };
  } catch {
    return { res, data: null as unknown as Json, raw: text };
  }
}

// Simple feature flag reader (defaults OFF to protect against accidental sends)
function smsEnabled(): boolean {
  const v = (Deno.env.get("SMS_ENABLED") || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OWNER_MOBILE = Deno.env.get("OWNER_MOBILE")!;
    const SMS_FN_URL = `${SUPABASE_URL}/functions/v1/sms`;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: "Server not configured" }, 500);
    }

    const body = await req.json().catch(() => ({})) as {
      booking_id?: string;
      google_event_id?: string;
    };

    const { booking_id, google_event_id } = body;
    if (!booking_id && !google_event_id) {
      return json({ error: "Provide booking_id or google_event_id" }, 400);
    }

    console.log(
      `[new-booking-owner-sms] Processing request for ${
        booking_id ? `booking_id=${booking_id}` : `google_event_id=${google_event_id}`
      }`
    );

    // 1) Load booking
    const queryParam = booking_id
      ? `id=eq.${encodeURIComponent(booking_id)}`
      : `google_event_id=eq.${encodeURIComponent(google_event_id!)}`;

    const { res: getRes, data: getData } = await fetchJson(
      `${SUPABASE_URL}/rest/v1/booking?select=id,client_id,is_booking,status,start_time,end_time,first_name,last_name,mobile,pickup_location,service_code,gcal_sequence,is_test,is_sms_enabled,sms_new_booking_sent_at&${queryParam}&limit=1`,
      {
        headers: {
          "apikey": SERVICE_KEY,
          "authorization": `Bearer ${SERVICE_KEY}`,
          "content-type": "application/json",
          "accept": "application/json",
        },
      },
    );

    if (!getRes.ok) {
      console.error(`[new-booking-owner-sms] Failed to load booking: ${getRes.status}`);
      return json(
        { error: "Failed to load booking", details: getData || (await getRes.text()) },
        502,
      );
    }

    const rows = (getData as unknown as any[]) || [];
    if (rows.length === 0) {
      console.error(`[new-booking-owner-sms] Booking not found`);
      return json({ error: "Booking not found" }, 404);
    }

    const b = rows[0] as {
      id: string;
      client_id: string | null;
      is_booking: boolean | null;
      status: string | null;
      start_time: string;
      end_time: string;
      first_name: string | null;
      last_name: string | null;
      mobile: string | null;
      pickup_location: string | null;
      service_code: string | null;
      gcal_sequence: number | null;
      is_test: boolean | null;
      is_sms_enabled: boolean | null;
      sms_new_booking_sent_at: string | null;
    };

    console.log(`[new-booking-owner-sms] Loaded booking ${b.id} for ${b.first_name} ${b.last_name}`);

    // Fetch service name and short_name from public.service
    let serviceName: string | null = null;
    let serviceShortName: string | null = null;

    if (b.service_code) {
      const { res: svcRes, data: svcData } = await fetchJson(
        `${SUPABASE_URL}/rest/v1/service?select=name,short_name&code=eq.${encodeURIComponent(b.service_code)}&limit=1`,
        {
          headers: {
            "apikey": SERVICE_KEY,
            "authorization": `Bearer ${SERVICE_KEY}`,
            "content-type": "application/json",
            "accept": "application/json",
          },
        },
      );

      if (svcRes.ok && Array.isArray(svcData) && svcData.length > 0) {
        serviceName = svcData[0].name || null;
        serviceShortName = svcData[0].short_name || null;
      }
    }

    // 2) Business rules (in order)
    if (b.sms_new_booking_sent_at) {
      console.log(`[new-booking-owner-sms] Owner alert already sent at ${b.sms_new_booking_sent_at}`);
      return json({ ok: true, skipped: "already_sent", booking_id: b.id });
    }
    if (!b.is_booking) {
      console.log(`[new-booking-owner-sms] Not a booking`);
      return json({ ok: true, skipped: "not_a_booking", booking_id: b.id });
    }
    if ((b.status || "confirmed") !== "confirmed") {
      console.log(`[new-booking-owner-sms] Status is ${b.status}, not confirmed`);
      return json({ ok: true, skipped: "not_confirmed", booking_id: b.id });
    }
    if (b.is_sms_enabled !== true) {
      console.log(`[new-booking-owner-sms] SMS disabled for booking`);
      return json({ ok: true, skipped: "sms_disabled", booking_id: b.id });
    }

    const start = new Date(b.start_time);
    if (!isFinite(start.getTime())) {
      console.error(`[new-booking-owner-sms] Invalid start_time: ${b.start_time}`);
      return json({ error: "Invalid start_time on booking" }, 400);
    }

    // NOTE: No past_event guard for owner alerts - owner should be notified
    // even if booking was created very close to start time

    if (b.gcal_sequence != null && b.gcal_sequence > 0) {
      console.log(`[new-booking-owner-sms] Not initial create, gcal_sequence=${b.gcal_sequence}`);
      return json({ ok: true, skipped: "not_initial_create", booking_id: b.id });
    }

    // 3) Validate owner mobile
    if (!OWNER_MOBILE) {
      console.error(`[new-booking-owner-sms] OWNER_MOBILE not configured`);
      return json({ error: "OWNER_MOBILE not configured" }, 500);
    }
    const { e164: ownerE164, isValid: ownerValid } = parseAuMobile(OWNER_MOBILE);
    if (!ownerValid || !ownerE164) {
      console.error(`[new-booking-owner-sms] Invalid OWNER_MOBILE: ${OWNER_MOBILE}`);
      return json({ error: "Invalid OWNER_MOBILE configuration" }, 500);
    }

    console.log(`[new-booking-owner-sms] Sending owner alert to ${ownerE164}`);

    // 4) Build owner alert message
    const firstName = b.first_name || "Unknown";
    const lastName = b.last_name || "";
    
    // Validate end_time
    const end = new Date(b.end_time);
    if (!isFinite(end.getTime())) {
      console.error(`[new-booking-owner-sms] Invalid end_time: ${b.end_time}`);
      return json({ error: "Invalid end_time on booking" }, 400);
    }
    
    // Compact date format: "10/3/26"
    const dateShort = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      day: "numeric",
      month: "numeric",
      year: "2-digit",
    }).format(start);
    
    // Hour-only time format: "10 am"
    const startHour = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      hour: "numeric",
      hour12: true,
    }).format(start).toLowerCase();
    
    const endHour = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      hour: "numeric",
      hour12: true,
    }).format(end).toLowerCase();

    // Build compact owner alert message
    const prefix = b.is_test === true ? "[TEST] " : "";
    
    let message = `${prefix}NEW BOOKING\n`;
    
    message += `Client: ${firstName} ${lastName}\n`;
    message += `Date: ${dateShort} ${startHour}-${endHour}\n`;
    
    const serviceLabel = serviceShortName ?? serviceName ?? b.service_code;
    
    if (serviceLabel) {
      message += `Service: ${serviceLabel}\n`;
    }
    
    // Remove commas from pickup address
    const pickup = b.pickup_location
      ? b.pickup_location.replace(/,/g, '').trim()
      : null;
    
    if (pickup) {
      message += `${pickup}\n`;
    }
    
    if (b.mobile) {
      message += `${b.mobile}`;
    }

    console.log(`[new-booking-owner-sms] Message preview: ${message.substring(0, 100)}...`);

    // 5) Send via central sms function (server→server with metadata)
    // NOTE: Owner alerts are NOT subject to SMS_EXCLUDE_MOBILES exclusions.
    // Exclusions are only for customer/test numbers, not operational alerts.
    let smsStatus: string = "pending";

    if (smsEnabled()) {
      console.log("[new-booking-owner-sms] sending via central sms", {
        booking_id: b.id,
        client_id: b.client_id ?? null,
        template: "new_booking_owner_alert",
        to: ownerE164,
      });

      const send = await fetchJson(SMS_FN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${SERVICE_KEY}`,
          "apikey": SERVICE_KEY,
        },
        body: JSON.stringify({
          to: ownerE164,
          message,
          template: "new_booking_owner_alert",
          client_id: b.client_id,
          booking_id: b.id,
        }),
      });

      console.log(`[new-booking-owner-sms] SMS function response: ${send.res.status}, ok=${send.res.ok}`);

      smsStatus = !send.res.ok || !(send.data as any)?.ok ? "failed" : "sent";

      if (smsStatus === "failed") {
        console.error(`[new-booking-owner-sms] SMS send failed:`, send.data);
        
        return json(
          { error: "SMS send failed", details: send.data ?? send.raw },
          502,
        );
      }
    } else {
      // Dry run mode - no SMS sent, no latch set (allows repeated testing)
      smsStatus = "dry_run";
      console.log("[new-booking-owner-sms] SMS_DISABLED via SMS_ENABLED env. Skipping external send.");
    }

    console.log(`[new-booking-owner-sms] SMS status: ${smsStatus}`);

    // 6) Mark sent (idempotency latch)
    // Central SMS function handles all logging, this file only updates booking flag
    // Only latch when: SMS actually sent
    // dry_run intentionally does NOT latch to allow repeated testing
    if (smsStatus === "sent") {
      const { res: updRes, data: updData } = await fetchJson(
        `${SUPABASE_URL}/rest/v1/booking?id=eq.${encodeURIComponent(b.id)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${SERVICE_KEY}`,
            "apikey": SERVICE_KEY,
            "prefer": "return=representation",
          },
          body: JSON.stringify({ sms_new_booking_sent_at: new Date().toISOString() }),
        },
      );

      if (!updRes.ok) {
        return json(
          { error: "SMS sent but failed to update flag", details: updData ?? (await updRes.text()) },
          502,
        );
      }
    }

    console.log(`[new-booking-owner-sms] Successfully completed for booking ${b.id} with status=${smsStatus}`);

    return json({
      ok: true,
      booking_id: b.id,
      sent_to: smsStatus === "sent" ? ownerE164 : null,
      message_preview: message,
      status: smsStatus,
    });
  } catch (err) {
    console.error("[new-booking-owner-sms] error:", err);
    return json({ error: "Unexpected error", details: String(err) }, 500);
  }
});
