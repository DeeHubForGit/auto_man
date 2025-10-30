// Send one-time booking confirmation SMS with full audit logging
// Usage (server-to-server or admin): POST /functions/v1/booking-sms
// Body: { booking_id?: string, google_event_id?: string }
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SMS_SENDER (optional)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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
        "authorization, x-client-info, apikey, content-type",
      ...(initObj as ResponseInit).headers || {},
    },
  });
}

function digits(v: string | null | undefined) {
  return (v || "").replace(/\D+/g, "");
}

// AU only. Adjust if you later want international.
function toE164Au(mobile: string | null | undefined): string | null {
  const d = digits(mobile || "");
  if (/^04\d{8}$/.test(d)) return `+61${d.slice(1)}`;
  if (/^614\d{8}$/.test(d)) return `+${d}`;
  if (/^\+614\d{8}$/.test(mobile || "")) return mobile!;
  return null;
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

// Format date with ordinal suffix (1st, 2nd, 3rd, etc.)
function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
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
      `[booking-sms] Processing request for ${
        booking_id ? `booking_id=${booking_id}` : `google_event_id=${google_event_id}`
      }`
    );

    // 1) Load booking with end_time
    const queryParam = booking_id
      ? `id=eq.${encodeURIComponent(booking_id)}`
      : `google_event_id=eq.${encodeURIComponent(google_event_id!)}`;

    const { res: getRes, data: getData } = await fetchJson(
      `${SUPABASE_URL}/rest/v1/booking?select=*&${queryParam}&limit=1`,
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
      console.error(`[booking-sms] Failed to load booking: ${getRes.status}`);
      return json(
        { error: "Failed to load booking", details: getData || (await getRes.text()) },
        502,
      );
    }

    const rows = (getData as unknown as any[]) || [];
    if (rows.length === 0) {
      console.error(`[booking-sms] Booking not found`);
      return json({ error: "Booking not found" }, 404);
    }

    const b = rows[0] as {
      id: string;
      is_booking: boolean | null;
      sms_confirm_sent_at: string | null;
      status: string | null;
      start_time: string;
      end_time: string;
      mobile: string | null;
      first_name: string | null;
      last_name: string | null;
      pickup_location: string | null;
      service_code: string | null;
      gcal_sequence: number | null;
      client_id: string | null;
    };

    console.log(`[booking-sms] Loaded booking ${b.id} for ${b.first_name} ${b.last_name}`);

    // 2) Idempotency and business rules
    if (b.sms_confirm_sent_at) {
      console.log(`[booking-sms] SMS already sent at ${b.sms_confirm_sent_at}`);
      return json({ ok: true, skipped: "already_sent", booking_id: b.id });
    }
    if (!b.is_booking) {
      console.log(`[booking-sms] Not a booking`);
      return json({ ok: true, skipped: "not_a_booking", booking_id: b.id });
    }
    if ((b.status || "confirmed") !== "confirmed") {
      console.log(`[booking-sms] Status is ${b.status}, not confirmed`);
      return json({ ok: true, skipped: "not_confirmed", booking_id: b.id });
    }

    const start = new Date(b.start_time);
    if (!isFinite(start.getTime())) {
      console.error(`[booking-sms] Invalid start_time: ${b.start_time}`);
      return json({ error: "Invalid start_time on booking" }, 400);
    }
    const now = new Date();
    // Optional: only send if event is in future
    if (start.getTime() <= now.getTime()) {
      console.log(`[booking-sms] Event in the past: ${start.toISOString()}`);
      return json({ ok: true, skipped: "past_event", booking_id: b.id });
    }

    // Optional: Google "created" only guard. If you populate gcal_sequence, use it:
    if (b.gcal_sequence != null && b.gcal_sequence > 0) {
      console.log(`[booking-sms] Not initial create, gcal_sequence=${b.gcal_sequence}`);
      return json({ ok: true, skipped: "not_initial_create", booking_id: b.id });
    }

    const e164 = toE164Au(b.mobile);
    if (!e164) {
      console.error(`[booking-sms] Invalid mobile: ${b.mobile}`);
      return json({ error: "Invalid or missing AU mobile on booking" }, 400);
    }

    console.log(`[booking-sms] Sending SMS to ${e164}`);

    // 3) Check if customer needs to complete intake form
    let needsIntake = false;
    if (b.client_id) {
      const { res: clientRes, data: clientData } = await fetchJson(
        `${SUPABASE_URL}/rest/v1/client?id=eq.${encodeURIComponent(b.client_id)}&select=intake_completed&limit=1`,
        {
          headers: {
            "apikey": SERVICE_KEY,
            "authorization": `Bearer ${SERVICE_KEY}`,
            "content-type": "application/json",
            "accept": "application/json",
          },
        },
      );
      
      if (clientRes.ok) {
        const clientRows = (clientData as unknown as any[]) || [];
        // If client doesn't exist or intake_completed is false/null, they need intake
        needsIntake = clientRows.length === 0 || clientRows[0]?.intake_completed !== true;
      } else {
        // If we can't check, assume they need intake (safe default)
        needsIntake = true;
      }
    } else {
      // No client_id means definitely needs intake
      needsIntake = true;
    }

    // 4) Build friendly message with improved formatting
    const firstName = b.first_name || "there";
    
    // Format date: "Sun 2nd Nov"
    const dayOfWeek = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      weekday: "short",
    }).format(start);
    
    const day = parseInt(new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      day: "numeric",
    }).format(start));
    
    const month = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      month: "short",
    }).format(start);
    
    const formattedDate = `${dayOfWeek} ${day}${getOrdinalSuffix(day)} ${month}`;
    
    // Format time range: "1:30 pm to 2:30 pm"
    const end = new Date(b.end_time);
    
    const startTime = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(start).toLowerCase();
    
    const endTime = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(end).toLowerCase();

    // Build message parts
    let message = `Hi ${firstName},\n\n`;
    message += `Your driving lesson is booked on ${formattedDate} from ${startTime} to ${endTime}.`;
    
    // Remove any commas so the full address will be shown when the user clicks on the SMS
    const pickup = b.pickup_location
      ? b.pickup_location.replace(/,/g, '').trim()
      : null;

    if (pickup) {
      message += `\nPickup: ${pickup}`;
    }
    
    if (needsIntake) {
      message += `\n\nPlease sign up on the Auto-Man website and advise of your permit/licence number before your first driving lesson:\nhttps://www.automandrivingschool.com.au/signup`;
    }
    
    // Standardised footer
    message += `\n\nThank you for booking with Auto-Man Driving School (0403 632 313)`;
    message += `\n\nCancellations require 24 hours notice.`;
    message += `\nThis is a no-reply SMS.`;

    console.log(`[booking-sms] Message preview: ${message.substring(0, 100)}...`);

    // 5) Send via existing sms function (server→server)
    let providerMessageId: string | null = null;
    let smsStatus: string = "pending";
    let errorMessage: string | null = null;
    let send: { res: Response; data: any; raw: string } | null = null; // <-- declared for safe return use

    if (smsEnabled()) {
      send = await fetchJson(SMS_FN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${SERVICE_KEY}`,
          "apikey": SERVICE_KEY,
        },
        body: JSON.stringify({ to: e164, message }),
      });

      console.log(`[booking-sms] SMS function response: ${send.res.status}, ok=${send.res.ok}`);

      if (!send.res.ok || !(send.data as any)?.ok) {
        console.error(`[booking-sms] SMS send failed:`, send.data);
        smsStatus = "failed";
        errorMessage = JSON.stringify(send.data ?? send.raw);
        
        // Log the failure to sms_log (fixed column names: body not message_body)
        await fetchJson(
          `${SUPABASE_URL}/rest/v1/sms_log`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "authorization": `Bearer ${SERVICE_KEY}`,
              "apikey": SERVICE_KEY,
              "prefer": "return=minimal",
            },
            body: JSON.stringify({
              booking_id: b.id,
              to_phone: e164,
              body: message,
              status: smsStatus,
              template: "booking_confirmation",
              provider: "clicksend",
              provider_message_id: null,
              error_message: errorMessage,
              sent_at: new Date().toISOString(),
            }),
          },
        );
        
        return json(
          { error: "SMS send failed", details: send.data ?? send.raw },
          502,
        );
      }

      // Extract provider message ID from ClickSend response
      const clicksendData = (send.data as any)?.clicksend;
      if (
        clicksendData?.data?.messages &&
        Array.isArray(clicksendData.data.messages) &&
        clicksendData.data.messages.length > 0
      ) {
        providerMessageId = clicksendData.data.messages[0].message_id || null;
        const msgStatus = clicksendData.data.messages[0].status;
        smsStatus = msgStatus === "SUCCESS" ? "sent" : "pending";
      } else {
        smsStatus = "sent";
      }
    } else {
      smsStatus = "dry_run";
      console.log("[booking-sms] SMS_DISABLED via SMS_ENABLED env. Skipping external send.");
    }

    console.log(`[booking-sms] Provider message ID: ${providerMessageId}, status: ${smsStatus}`);

    // 6) Log to sms_log table (fixed column names: body not message_body)
    const logRes = await fetchJson(
      `${SUPABASE_URL}/rest/v1/sms_log`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${SERVICE_KEY}`,
          "apikey": SERVICE_KEY,
          "prefer": "return=representation",
        },
        body: JSON.stringify({
          booking_id: b.id,
          to_phone: e164,
          body: message,
          status: smsStatus,
          template: "booking_confirmation",
          provider: "clicksend",
          provider_message_id: providerMessageId,
          error_message: errorMessage,
          sent_at: new Date().toISOString(),
        }),
      },
    );

    if (!logRes.res.ok) {
      const logError = await logRes.res.text();
      console.warn(`[booking-sms] Failed to log to sms_log: ${logRes.res.status}`);
      console.warn(`[booking-sms] Log error details: ${logError}`);
    } else {
      console.log(`[booking-sms] Logged to sms_log successfully`);
    }

    // 7) Mark sent (idempotency latch) — only when actually sent/pending
    if (smsStatus === "sent" || smsStatus === "pending") {
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
          body: JSON.stringify({ sms_confirm_sent_at: new Date().toISOString() }),
        },
      );

      if (!updRes.ok) {
        return json(
          { error: "SMS sent but failed to update flag", details: updData ?? (await updRes.text()) },
          502,
        );
      }
    }

    console.log(`[booking-sms] Successfully completed for booking ${b.id} with status=${smsStatus}`);

    return json({
      ok: true,
      booking_id: b.id,
      sent_to: e164,
      provider_message_id: providerMessageId,
      clicksend: smsEnabled() ? (send?.data as any)?.clicksend ?? null : null,
      message_preview: message,
      needs_intake: needsIntake,
      status: smsStatus,
    });
  } catch (err) {
    console.error("[booking-sms] error:", err);
    return json({ error: "Unexpected error", details: String(err) }, 500);
  }
});
