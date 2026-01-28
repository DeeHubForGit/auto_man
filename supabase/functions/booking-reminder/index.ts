// @ts-nocheck
// Google Calendar → Booking reminder SMS sender
// -----------------------------------------------------------
// Finds bookings starting ~X hours from now and sends a short reminder.
// Safe to run on a frequent schedule; uses sms_reminder_sent_at for idempotency.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, (optional) SMS_SENDER
// Optional Env: REMINDER_HOURS (default 24), REMINDER_WINDOW_MINUTES (default 10)
// Optional Env: SMS_ENABLED ("true"/"false") to hard-disable sends during testing
// POST body can override:
//   { booking_id?: string, hours?: number, window_minutes?: number, dry_run?: boolean, limit?: number }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { parseAuMobile, normaliseAuMobileForCompare } from "../_shared/mobile.ts";

type Json = Record<string, unknown>;

function json(body: Json, init: number | ResponseInit = 200) {
  const initObj = typeof init === "number" ? ({ status: init } as ResponseInit) : init;
  return new Response(JSON.stringify(body), {
    ...initObj,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
      ...(initObj.headers || {}),
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

function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}
function fmtTimeAU(dt: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(dt)
    .toLowerCase();
}
function fmtShortDateAU(dt: Date) {
  const wd = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    weekday: "short",
  }).format(dt);
  const d = parseInt(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      day: "numeric",
    }).format(dt),
  );
  const m = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    month: "short",
  }).format(dt);
  return `${wd} ${d}${getOrdinalSuffix(d)} ${m}`;
}

// Simple feature flag reader (defaults OFF if unset/garbage → safer during testing)
function smsEnabled(): boolean {
  const v = (Deno.env.get("SMS_ENABLED") || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function isSmsExclusionEnabled(): boolean {
  const v = (Deno.env.get("SMS_EXCLUDE_MOBILES_ENABLED") || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function isSmsExcluded(mobile: string): boolean {
  if (!isSmsExclusionEnabled()) return false;

  const rawList = (Deno.env.get("SMS_EXCLUDE_MOBILES") || "").trim();
  if (!rawList) return false;

  const target = normaliseAuMobileForCompare(mobile);
  if (!target) return false;

  const list = rawList
    .split(",")
    .map((s) => normaliseAuMobileForCompare(s))
    .filter(Boolean);

  return list.includes(target);
}

serve(async (req) => {
  console.log("[booking-reminder] invoked", req.method, new Date().toISOString());
  
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Server not configured" }, 500);

    // Defaults from env, overridable via body.
    const envHours = Number(Deno.env.get("REMINDER_HOURS") || 24);
    const envWindow = Number(Deno.env.get("REMINDER_WINDOW_MINUTES") || 10);

    // Accept booking_id to force a single-target reminder.
    const body = (await req.json().catch(() => ({}))) as {
      booking_id?: string;
      hours?: number;
      window_minutes?: number;
      dry_run?: boolean;
      limit?: number;
    };

    const HOURS = Number.isFinite(body.hours) ? Number(body.hours) : envHours;
    const WINDOW_MIN = Number.isFinite(body.window_minutes) ? Number(body.window_minutes) : envWindow;
    const DRY_RUN = !!body.dry_run;
    const LIMIT = Math.max(1, Math.min(200, Number.isFinite(body.limit) ? Number(body.limit) : 100));

    const now = new Date();

    // ---------- Load bookings ----------
    let bookings: any[] = [];

    if (body.booking_id) {
      // Single-booking path: load exactly this booking.
      const one = await fetchJson(
        `${SUPABASE_URL}/rest/v1/booking?select=*&id=eq.${encodeURIComponent(body.booking_id)}&limit=1`,
        { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, accept: "application/json" } },
      );

      if (!one.res.ok) {
        return json({ error: "Failed to load booking", details: one.data ?? (await one.res.text()) }, 502);
      }

      const rows = (one.data as any[]) ?? [];
      if (rows.length) bookings = rows;
    } else {
      // Window scan (original behaviour).
      // Target time window = (now + HOURS) ± WINDOW/2 minutes
      const center = new Date(now.getTime() + HOURS * 3600_000);
      const half = Math.max(1, Math.floor(WINDOW_MIN / 2)) * 60_000;
      const startGte = new Date(center.getTime() - half).toISOString();
      const startLt = new Date(center.getTime() + half).toISOString();

      // Pull candidate bookings
      const q = new URLSearchParams({
        select: "*",
        limit: String(LIMIT),
        order: "start_time.asc",
        and: `(${[
          "is_booking.is.true",
          "sms_reminder_sent_at.is.null",
          "start_time.gte." + startGte,
          "start_time.lt." + startLt,
        ].join(",")})`,
      });

      // Keep status guard (confirmed or null) outside the AND for clarity
      q.append("or", "(status.is.null,status.eq.confirmed)");

      const list = await fetchJson(`${SUPABASE_URL}/rest/v1/booking?${q.toString()}`, {
        headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, accept: "application/json" },
      });

      if (!list.res.ok) {
        return json({ error: "Failed to list bookings", details: list.data ?? (await list.res.text()) }, 502);
      }

      bookings = ((list.data as any[]) ?? []);
    }

    const results: any[] = [];

    for (const b of bookings) {
      try {
        // Guard rails (these were encoded in the window query; we repeat for single-id path)
        if (b.is_booking === false) {
          results.push({ id: b.id, skipped: "not_a_booking" });
          continue;
        }
        if (b.sms_reminder_sent_at) {
          results.push({ id: b.id, skipped: "already_sent" });
          continue;
        }
        if (b.status && b.status !== "confirmed") {
          results.push({ id: b.id, skipped: `status_${b.status}` });
          continue;
        }

        const start = new Date(b.start_time);
        const end = new Date(b.end_time);
        if (!isFinite(start.getTime()) || !isFinite(end.getTime())) {
          results.push({ id: b.id, skipped: "bad_dates" });
          continue;
        }
        if (start.getTime() <= now.getTime()) {
          results.push({ id: b.id, skipped: "past" });
          continue;
        }

        const { e164, isValid } = parseAuMobile(b.mobile);
        if (!isValid || !e164) {
          results.push({ id: b.id, skipped: "invalid_mobile" });
          continue;
        }

        // -------- Intake nudge: only if intake not completed --------
        let addIntakeNudge = false;

        if (b.client_id) {
          const cl = await fetchJson(
            `${SUPABASE_URL}/rest/v1/client?id=eq.${encodeURIComponent(b.client_id)}&select=intake_completed&limit=1`,
            {
              headers: {
                apikey: SERVICE_KEY,
                authorization: `Bearer ${SERVICE_KEY}`,
                accept: "application/json",
              },
            },
          );

          const intakeCompleted =
            cl.res.ok &&
            Array.isArray(cl.data) &&
            (cl.data as any[]).length > 0 &&
            (cl.data as any[])[0]?.intake_completed === true;

          addIntakeNudge = !intakeCompleted;
        }

        // -----------------------------------------------------
        // Compose friendly reminder message (standardised copy)
        // -----------------------------------------------------
        const firstName = (b.first_name || "there").trim();
        const whenDate = fmtShortDateAU(start);
        const whenStart = fmtTimeAU(start);
        const whenEnd = fmtTimeAU(end);

        // Normalise pickup for better auto-linking in SMS
        const pickupRaw = (b.pickup_location || "").trim();

        // Remove commas (some phones split links at commas)
        const pickupDisplay = pickupRaw ? pickupRaw.replace(/,/g, "") : "";

        let msg = `Hi ${firstName},\n\n`;
        msg += `This is a friendly reminder that your driving lesson is on ${whenDate} from ${whenStart} to ${whenEnd}.`;
        if (pickupDisplay) {
          msg += `\nPickup: ${pickupDisplay}`;
        }

        if (addIntakeNudge) {
          msg += `\n\nPlease sign up on the Auto-Man website and advise of your permit/licence number before your driving lesson:\nhttps://www.automandrivingschool.com.au/signup`;
        }
        
        // Standardised footer
        msg += `\n\nThank you for booking with Auto-Man Driving School (0403 632 313)`;
        msg += `\n\nCancellations require 24 hours notice.`;
        msg += `\nThis is a no-reply SMS.`;

        // Respect global SMS_ENABLED and per-request dry_run
        if (DRY_RUN || !smsEnabled()) {
          results.push({
            id: b.id,
            ok: true,
            status: "dry_run",
            to: e164,
            message_preview: msg.slice(0, 160) + "…",
          });
          continue;
        }

        // Exclusion list (demo/dev safety)
        if (isSmsExcluded(b.mobile)) {
          console.log("[booking-reminder] SMS excluded for", {
            booking_id: b.id,
            mobile: b.mobile,
          });

          results.push({
            id: b.id,
            ok: true,
            status: "excluded",
            to: e164,
            message_preview: msg.slice(0, 160) + "…",
          });

          // IMPORTANT: do NOT log to sms_log and do NOT latch sms_reminder_sent_at
          continue;
        }

        // Send via existing sms function
        const send = await fetchJson(`${SUPABASE_URL}/functions/v1/sms`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
          },
          body: JSON.stringify({ to: e164, message: msg }),
        });

        let status = "pending";
        let provider_message_id: string | null = null;

        if (!send.res.ok || !(send.data as any)?.ok) {
          status = "failed";
        } else {
          const cs = (send.data as any)?.clicksend;
          if (cs?.data?.messages?.length) {
            provider_message_id = cs.data.messages[0]?.message_id ?? null;
            status = cs.data.messages[0]?.status === "SUCCESS" ? "sent" : "pending";
          } else {
            status = "sent";
          }
        }

        // Log to sms_log
        await fetchJson(`${SUPABASE_URL}/rest/v1/sms_log`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
            prefer: "return=minimal",
          },
          body: JSON.stringify({
            booking_id: b.id,
            to_phone: e164,
            body: msg,
            status,
            template: "booking_reminder",
            provider: "clicksend",
            provider_message_id,
            error_message: status === "failed" ? JSON.stringify(send.data) : null,
            sent_at: new Date().toISOString(),
          }),
        });

        if (status === "failed") {
          results.push({ id: b.id, error: "send_failed", send: send.data });
          continue;
        }

        // Latch to prevent duplicates
        await fetchJson(`${SUPABASE_URL}/rest/v1/booking?id=eq.${encodeURIComponent(b.id)}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
            prefer: "return=minimal",
          },
          body: JSON.stringify({ sms_reminder_sent_at: new Date().toISOString() }),
        });

        results.push({ id: b.id, ok: true, to: e164, status, provider_message_id });
      } catch (innerErr) {
        results.push({ id: (b && b.id) || null, error: String(innerErr) });
      }
    }

    return json({
      ok: true,
      hours: HOURS,
      window_minutes: WINDOW_MIN,
      dry_run: DRY_RUN,
      examined: bookings.length,
      sent: results.filter((r) => r.ok).length,
      results,
    });
  } catch (err) {
    console.error("[booking-reminder] error:", err);
    return json({ error: "Unexpected error", details: String(err) }, 500);
  }
});
