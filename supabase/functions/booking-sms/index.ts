// Send one-time booking confirmation SMS.
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

    // 1) Load booking
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
      return json(
        { error: "Failed to load booking", details: getData || (await getRes.text()) },
        502,
      );
    }

    const rows = (getData as unknown as any[]) || [];
    if (rows.length === 0) return json({ error: "Booking not found" }, 404);

    const b = rows[0] as {
      id: string;
      is_booking: boolean | null;
      sms_confirm_sent_at: string | null;
      status: string | null;
      start_time: string;
      mobile: string | null;
      first_name: string | null;
      last_name: string | null;
      pickup_location: string | null;
      service_code: string | null;
      gcal_sequence: number | null;
    };

    // 2) Idempotency and business rules
    if (b.sms_confirm_sent_at) {
      return json({ ok: true, skipped: "already_sent", booking_id: b.id });
    }
    if (!b.is_booking) {
      return json({ ok: true, skipped: "not_a_booking", booking_id: b.id });
    }
    if ((b.status || "confirmed") !== "confirmed") {
      return json({ ok: true, skipped: "not_confirmed", booking_id: b.id });
    }

    const start = new Date(b.start_time);
    if (!isFinite(start.getTime())) {
      return json({ error: "Invalid start_time on booking" }, 400);
    }
    const now = new Date();
    // Optional: only send if event is in future
    if (start.getTime() <= now.getTime()) {
      return json({ ok: true, skipped: "past_event", booking_id: b.id });
    }

    // Optional: Google "created" only guard. If you populate gcal_sequence, use it:
    if (b.gcal_sequence != null && b.gcal_sequence > 0) {
      return json({ ok: true, skipped: "not_initial_create", booking_id: b.id });
    }

    const e164 = toE164Au(b.mobile);
    if (!e164) {
      return json({ error: "Invalid or missing AU mobile on booking" }, 400);
    }

    // 3) Build friendly message
    const when = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(start);

    const name = [b.first_name, b.last_name].filter(Boolean).join(" ").trim();
    const pickup = b.pickup_location ? ` Pickup: ${b.pickup_location}.` : "";
    const svc = b.service_code ? ` (${b.service_code.replace(/_/g, " ")})` : "";

    const message =
      `Thanks for booking Auto-Man${name ? ", " + name : ""}. ` +
      `Your lesson${svc} is ${when}.` + pickup + ` `;

    // 4) Send via existing sms function (server→server)
    const send = await fetchJson(SMS_FN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": SERVICE_KEY,
      },
      body: JSON.stringify({ to: e164, message }),
    });

    if (!send.res.ok || !(send.data as any)?.ok) {
      return json(
        { error: "SMS send failed", details: send.data ?? send.raw },
        502,
      );
    }

    // 5) Mark sent (idempotency latch)
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

    return json({
      ok: true,
      booking_id: b.id,
      sent_to: e164,
      clicksend: (send.data as any)?.data ?? null,
      message_preview: message,
    });
  } catch (err) {
    console.error("[booking-sms] error:", err);
    return json({ error: "Unexpected error", details: String(err) }, 500);
  }
});
