// Google Calendar → Supabase Booking Sync with Logging
// ======================================================
// Full, copy/paste-ready Deno function.
//
// - Pulls fields from Google events via parseGcalEvent (extendedProperties first)
// - Falls back to title/duration inference + description/location parsing
// - Sends p_is_booking and p_title
// - Sends p_extended as a boolean (parsed), not whole event JSON
// - Optional debug dump when DEBUG_GCAL_DUMP=true

import { extractContactFromEvent, extractPickupFromEvent } from "./gcal-parsers.ts";
import { parseGcalEvent } from "../_shared/parseEvent.ts"; // <- shared parser

const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

function b64url(s: string) {
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON");

  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims: any = {
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

  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.access_token) {
    throw new Error(`Token error: ${res.status} ${JSON.stringify(tok)}`);
  }
  return tok.access_token;
}

// ---- Service-code inference from title + duration (fallback) ----
function mapDurationToAutoServiceCode(mins: number | null): string | null {
  if (mins === null) return null;
  if (Math.abs(mins - 60) <= 10) return "auto_60";
  if (Math.abs(mins - 90) <= 15) return "auto_90";
  if (Math.abs(mins - 120) <= 20) return "auto_120";
  return null;
}

function mapDurationToSeniorAutoServiceCode(mins: number | null): string | null {
  if (mins === null) return null;
  if (Math.abs(mins - 60) <= 10) return "senior_auto_60";
  if (Math.abs(mins - 90) <= 15) return "senior_auto_90";
  if (Math.abs(mins - 120) <= 20) return "senior_auto_120";
  return null;
}

function mapDurationToManualServiceCode(mins: number | null): string | null {
  if (mins === null) return null;
  if (Math.abs(mins - 60) <= 10) return "manual_60";
  if (Math.abs(mins - 90) <= 15) return "manual_90";
  if (Math.abs(mins - 120) <= 20) return "manual_120";
  return null;
}

function mapDurationToSeniorManualServiceCode(mins: number | null): string | null {
  if (mins === null) return null;
  if (Math.abs(mins - 60) <= 10) return "senior_manual_60";
  if (Math.abs(mins - 90) <= 15) return "senior_manual_90";
  if (Math.abs(mins - 120) <= 20) return "senior_manual_120";
  return null;
}

function inferServiceCodeFromTitleAndDuration(title: string | null, mins: number | null): string | null {
  if (!title) return null;
  const looksLesson = /driving lesson/i.test(title) || /lesson/i.test(title);
  const hasAuto = /\b(auto|automatic)\b/i.test(title);
  const hasManual = /\bmanual\b/i.test(title);
  const hasSenior = /\bsenior\b/i.test(title);

  if (hasSenior) {
    if (hasManual) return mapDurationToSeniorManualServiceCode(mins);
    return mapDurationToSeniorAutoServiceCode(mins) ?? (hasAuto ? "senior_auto_60" : null);
  }
  if (hasManual && looksLesson) return mapDurationToManualServiceCode(mins);
  if (hasAuto && looksLesson) return mapDurationToAutoServiceCode(mins);
  if (/\bautomatic driving lesson\b/i.test(title)) return mapDurationToAutoServiceCode(mins);
  return null;
}

// ---- Optional debug dump control ----
let debugDumpCount = 0;
const DEBUG_DUMP_LIMIT = 5;

Deno.serve(async (_req) => {
  const supa = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const calendars = (Deno.env.get("GCAL_CALENDAR_IDS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const startTime = new Date();
  console.log(`🚀 Starting Google Calendar sync at ${startTime.toISOString()}`);

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error("Failed to get access token:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: Array<{ calendar_id: string; synced: number }> = [];

  for (const calendar_id of calendars) {
    let synced = 0;
    let status = "success";
    let error_message: string | null = null;
    const started_at = new Date();

    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar_id)}/events` +
        `?singleEvents=true&orderBy=startTime&timeMin=${new Date().toISOString()}`;
      const eventsRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

      if (!eventsRes.ok) throw new Error(`Google API error ${eventsRes.status}: ${await eventsRes.text()}`);

      const eventsData = await eventsRes.json();
      const events: any[] = eventsData.items ?? [];

      for (const e of events) {
        const eventId = e.id;
        const startRaw = e.start?.dateTime ?? e.start?.date;
        const endRaw = e.end?.dateTime ?? e.end?.date;
        if (!eventId || !startRaw || !endRaw) continue;
        if (e.status === "cancelled") continue;

        // Optional: short debug log
        if (Deno.env.get("DEBUG_GCAL_DUMP") === "true" && debugDumpCount < DEBUG_DUMP_LIMIT) {
          debugDumpCount++;
          fetch(`${supa}/rest/v1/gcal_sync_event_log`, {
            method: "POST",
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify([
              {
                sync_log_id: null,
                calendar_id,
                event_id: eventId,
                action: "debug-dump",
                message: JSON.stringify({ id: eventId, summary: e.summary ?? null }).slice(0, 3000),
                created_at: new Date().toISOString(),
              },
            ]),
          }).catch(() => {});
        }

        const title: string | null =
          typeof e.summary === "string" && e.summary.trim() ? e.summary.trim() : null;

        // Duration (mins)
        let durationMinutes: number | null = null;
        const s = new Date(startRaw);
        const en = new Date(endRaw);
        if (!Number.isNaN(s.getTime()) && !Number.isNaN(en.getTime())) {
          durationMinutes = Math.round((en.getTime() - s.getTime()) / 60000);
        }

        // ---- PRIMARY: parse extendedProperties + description/location
        const parsed = parseGcalEvent(e);

        // Pickup (prefer parsed, fallback to our extractor)
        const pickup =
          (parsed.pickup_location && parsed.pickup_location.trim()) ||
          extractPickupFromEvent(e) ||
          null;

        // Booking detection (same rule as before)
        const titleLooksLikeLesson = title ? /driving lesson/i.test(title) : false;
        const hasPickup = Boolean(pickup && String(pickup).trim() !== "");
        const isBooking = titleLooksLikeLesson || hasPickup;

        // Service code
        const inferredService = inferServiceCodeFromTitleAndDuration(title, durationMinutes);
        const service_code_to_send = parsed.service_code ?? inferredService ?? null;

        // Price (cents)
        const price_to_send = parsed.price_cents ?? null;

        // Extended boolean
        const extended_bool = parsed.extended ?? null;

        // Contact info
        const contact = extractContactFromEvent(e);
        const emailCandidate =
          contact.email || e.attendees?.[0]?.email || e.creator?.email || "unknown@example.com";
        const firstNameCandidate =
          contact.first_name ||
          (typeof e.attendees?.[0]?.displayName === "string"
            ? (e.attendees[0].displayName.split(" ", 2)[0] || null)
            : null);
        const lastNameCandidate =
          contact.last_name ||
          (typeof e.attendees?.[0]?.displayName === "string"
            ? (e.attendees[0].displayName.split(" ", 2)[1] || null)
            : null);

        // Build RPC payload
        const payload = {
          p_google_event_id: eventId,
          p_calendar_id: calendar_id,
          p_client_email: emailCandidate,
          p_first_name: firstNameCandidate ?? null,
          p_last_name: lastNameCandidate ?? null,
          p_mobile: contact.mobile ?? null,
          p_service_code: service_code_to_send,
          p_price_cents: price_to_send,
          p_start: startRaw,
          p_end: endRaw,
          p_pickup: pickup,
          p_extended: extended_bool, // <- boolean/null
          p_is_booking: isBooking,
          p_title: title,
        };

        const upRes = await fetch(`${supa}/rest/v1/rpc/upsert_booking_from_google`, {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (upRes.ok) {
          synced++;
        } else {
          console.warn(`Upsert failed for event ${eventId}:`, await upRes.text().catch(() => "non-json error"));
        }
      }

      // Persist nextSyncToken if present
      if (eventsData.nextSyncToken) {
        await fetch(`${supa}/rest/v1/gcal_state`, {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify([
            {
              calendar_id,
              sync_token: eventsData.nextSyncToken,
              updated_at: new Date().toISOString(),
            },
          ]),
        }).catch(() => {});
      }
    } catch (err) {
      status = "failed";
      error_message = String(err);
      console.error(`❌ Error syncing ${calendar_id}:`, err);
    }

    const finished_at = new Date();

    // Log the sync run (best effort)
    try {
      await fetch(`${supa}/rest/v1/gcal_sync_log`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify([
          {
            calendar_id,
            started_at,
            finished_at,
            status,
            synced_count: synced,
            inserted_count: 0,
            updated_count: 0,
            error_message,
          },
        ]),
      });
    } catch (logErr) {
      console.warn("⚠️ Logging failed (non-fatal):", logErr);
    }

    results.push({ calendar_id, synced });
  }

  const endTime = new Date();
  console.log(`✅ Sync complete at ${endTime.toISOString()}`);
  return new Response(
    JSON.stringify({
      ok: true,
      started_at: startTime.toISOString(),
      finished_at: endTime.toISOString(),
      results,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
