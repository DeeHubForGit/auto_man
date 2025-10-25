// Google Calendar → Supabase Booking Sync with Logging
// ======================================================
// Full, copy/paste-ready Deno function. This is the complete file — no missing pieces.
// - Robust extraction of contact and pickup data from Google events
// - Service inference for auto/manual/senior variants based on title + duration
// - Sends p_is_booking and p_title to RPC and stores p_extended JSON
// - Optional debug dump when DEBUG_GCAL_DUMP=true (writes short rows to gcal_sync_event_log)
import { extractContactFromEvent, extractPickupFromEvent } from "./gcal-parsers.ts";

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
    ["sign"]
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
  if (!res.ok || !tok.access_token)
    throw new Error(`Token error: ${res.status} ${JSON.stringify(tok)}`);

  return tok.access_token;
}

// Map an approximate duration to "auto" service codes (or "manual" if implemented).
function mapDurationToAutoServiceCode(durationMinutes: number | null): string | null {
  if (durationMinutes === null) return null;
  if (Math.abs(durationMinutes - 60) <= 10) return "auto_60";
  if (Math.abs(durationMinutes - 90) <= 15) return "auto_90";
  if (Math.abs(durationMinutes - 120) <= 20) return "auto_120";
  return null;
}

function mapDurationToSeniorAutoServiceCode(durationMinutes: number | null): string | null {
  if (durationMinutes === null) return null;
  if (Math.abs(durationMinutes - 60) <= 10) return "senior_auto_60";
  if (Math.abs(durationMinutes - 90) <= 15) return "senior_auto_90";
  if (Math.abs(durationMinutes - 120) <= 20) return "senior_auto_120";
  return null;
}

function mapDurationToManualServiceCode(durationMinutes: number | null): string | null {
  if (durationMinutes === null) return null;
  if (Math.abs(durationMinutes - 60) <= 10) return "manual_60";
  if (Math.abs(durationMinutes - 90) <= 15) return "manual_90";
  if (Math.abs(durationMinutes - 120) <= 20) return "manual_120";
  return null;
}

function mapDurationToSeniorManualServiceCode(durationMinutes: number | null): string | null {
  if (durationMinutes === null) return null;
  if (Math.abs(durationMinutes - 60) <= 10) return "senior_manual_60";
  if (Math.abs(durationMinutes - 90) <= 15) return "senior_manual_90";
  if (Math.abs(durationMinutes - 120) <= 20) return "senior_manual_120";
  return null;
}

// Infer service code using title keywords + duration. Conservative: return null if uncertain.
function inferServiceCodeFromTitleAndDuration(title: string | null, durationMinutes: number | null): string | null {
  if (!title) return null;

  const looksLikeDrivingLesson = /driving lesson/i.test(title) || /lesson/i.test(title);
  const containsAuto = /\b(auto|automatic)\b/i.test(title);
  const containsManual = /\bmanual\b/i.test(title);
  const containsSenior = /\bsenior\b/i.test(title);

  if (containsSenior) {
    if (containsManual) {
      const seniorManual = mapDurationToSeniorManualServiceCode(durationMinutes);
      if (seniorManual) return seniorManual;
      return null;
    }
    const seniorService = mapDurationToSeniorAutoServiceCode(durationMinutes);
    if (seniorService) return seniorService;
    if (containsAuto) return "senior_auto_60";
    return null;
  }

  if (containsManual && looksLikeDrivingLesson) {
    const manualService = mapDurationToManualServiceCode(durationMinutes);
    if (manualService) return manualService;
    return null;
  }

  if (containsAuto && looksLikeDrivingLesson) {
    return mapDurationToAutoServiceCode(durationMinutes) ?? null;
  }

  if (/\bautomatic driving lesson\b/i.test(title)) {
    return mapDurationToAutoServiceCode(durationMinutes) ?? null;
  }

  return null;
}

// Robust helper to extract "Pickup Address" from a Google event.
function extractPickupFromEvent(e: any): string | null {
  // 1) e.location often contains pickup address
  if (typeof e.location === "string" && e.location.trim().length > 0) {
    return e.location.trim();
  }

  // 2) extendedProperties may store custom form answers (private or shared)
  const epPrivate = e.extendedProperties?.private ?? {};
  const epShared = e.extendedProperties?.shared ?? {};

  const candidateKeys = [
    "pickup_address",
    "pickup",
    "Pickup Address",
    "Pickup",
    "pickupAddress",
    "pickup-address"
  ];

  for (const k of candidateKeys) {
    if (epPrivate && typeof epPrivate[k] === "string" && epPrivate[k].trim().length > 0) {
      return epPrivate[k].trim();
    }
    if (epShared && typeof epShared[k] === "string" && epShared[k].trim().length > 0) {
      return epShared[k].trim();
    }
  }

  // 3) Fallback: parse description for labelled answers
  if (typeof e.description === "string" && e.description.trim().length > 0) {
    const desc = e.description;
    const regexes = [
      /pickup address\s*[:\-]\s*(.+)/i,
      /pickup\s*[:\-]\s*(.+)/i,
      /pickup_address\s*[:\-]\s*(.+)/i,
    ];
    for (const rx of regexes) {
      const m = desc.match(rx);
      if (m && m[1]) {
        const firstLine = m[1].split(/\r?\n/)[0].trim();
        if (firstLine.length > 0) return firstLine;
      }
    }

    // Block style fallback
    const blockRx = /Pickup Address[\s\S]{0,50}?[:\-]\s*([^\n\r]+)/i;
    const bm = desc.match(blockRx);
    if (bm && bm[1]) {
      return bm[1].trim();
    }
  }

  return null;
}

// Robust helper to extract contact info (first_name, last_name, email, mobile)
function extractContactFromEvent(e: any): { first_name: string | null, last_name: string | null, email: string | null, mobile: string | null } {
  // 1) Prefer a non-self attendee (guest) if available
  const attendees = Array.isArray(e.attendees) ? e.attendees : [];
  const attendee = attendees.find((a: any) => !a.self) ?? attendees[0] ?? null;

  if (attendee) {
    const emailFromAttendee: string | null = attendee.email ?? null;
    const nameFromAttendee: string | null = attendee.displayName ?? attendee.displayname ?? null;
    const phoneFromAttendee: string | null = attendee.phone ?? attendee.displayPhone ?? null;

    if (emailFromAttendee || nameFromAttendee) {
      let first: string | null = null;
      let last: string | null = null;
      if (typeof nameFromAttendee === "string" && nameFromAttendee.trim().length > 0) {
        const parts = nameFromAttendee.trim().split(/\s+/);
        first = parts[0] || null;
        last = parts.length > 1 ? parts.slice(1).join(" ") : null;
      }
      const normalizedPhone = typeof phoneFromAttendee === "string" && phoneFromAttendee.trim().length > 0
        ? phoneFromAttendee.replace(/[^\d+]/g, '')
        : null;
      return { first_name: first, last_name: last, email: emailFromAttendee, mobile: normalizedPhone };
    }
  }

  // 2) Check extendedProperties.private/shared for common form field keys
  const epPrivate = e.extendedProperties?.private ?? {};
  const epShared = e.extendedProperties?.shared ?? {};
  const keySets = {
    first: ["first_name", "first-name", "first name", "given_name", "givenName", "given-name"],
    last:  ["last_name", "last-name", "last name", "surname", "family_name"],
    email: ["email", "email_address", "email-address", "your_email", "Email address"],
    mobile:["mobile", "mobile_number", "mobile-number", "phone", "phone_number", "phone-number"]
  };

  function pickKey(obj: any, keys: string[]): string | null {
    for (const k of keys) {
      if (obj && typeof obj[k] === "string" && obj[k].trim().length > 0) return obj[k].trim();
    }
    return null;
  }

  const firstFromEp = pickKey(epPrivate, keySets.first) ?? pickKey(epShared, keySets.first);
  const lastFromEp  = pickKey(epPrivate, keySets.last)  ?? pickKey(epShared, keySets.last);
  const emailFromEp = pickKey(epPrivate, keySets.email) ?? pickKey(epShared, keySets.email);
  const mobileFromEp= pickKey(epPrivate, keySets.mobile) ?? pickKey(epShared, keySets.mobile);
  if (firstFromEp || lastFromEp || emailFromEp || mobileFromEp) {
    const normalizedMobile = mobileFromEp ? mobileFromEp.replace(/[^\d+]/g, '') : null;
    return { first_name: firstFromEp ?? null, last_name: lastFromEp ?? null, email: emailFromEp ?? null, mobile: normalizedMobile };
  }

  // 3) Parse description for labelled answers
  if (typeof e.description === "string" && e.description.trim().length > 0) {
    const desc = e.description;

    // Booked by
    let bookedByMatch = desc.match(/Booked by\s*[:\-]?\s*(?:\n\s*)?([^\n\r]+)/i) ?? desc.match(/Booked by\s*[:\-]?\s*([^\n\r]+)/i);
    let first: string | null = null;
    let last: string | null = null;
    if (bookedByMatch && bookedByMatch[1]) {
      const name = bookedByMatch[1].trim();
      const parts = name.split(/\s+/);
      first = parts[0] || null;
      last = parts.length > 1 ? parts.slice(1).join(" ") : null;
    }

    // Email
    const emailMatch = desc.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
    const email = emailMatch ? emailMatch[1] : null;

    // Mobile
    let mobileMatch = desc.match(/(?:Mobile|Phone)\s*[:\-]?\s*([0-9+\s\-\(\)]{6,20})/i);
    if (!mobileMatch) {
      const loose = desc.match(/(\+?\d[\d\-\s\(\)]{6,20}\d)/);
      if (loose) mobileMatch = loose;
    }
    const mobile = mobileMatch ? mobileMatch[1].replace(/[^\d+]/g, '') : null;

    if (first || last || email || mobile) {
      return { first_name: first, last_name: last, email, mobile };
    }
  }

  // 4) Last resort: creator/organizer metadata
  const creatorEmail = e.creator?.email ?? null;
  const creatorName = e.creator?.displayName ?? e.organizer?.displayName ?? null;
  if (creatorEmail || creatorName) {
    let first: string | null = null;
    let last: string | null = null;
    if (typeof creatorName === "string" && creatorName.trim().length > 0) {
      const parts = creatorName.trim().split(/\s+/);
      first = parts[0] || null;
      last = parts.length > 1 ? parts.slice(1).join(" ") : null;
    }
    return { first_name: first, last_name: last, email: creatorEmail, mobile: null };
  }

  return { first_name: null, last_name: null, email: null, mobile: null };
}

// Optional debug dump into gcal_sync_event_log for first N events when DEBUG_GCAL_DUMP=true
let debugDumpCount = 0;
const DEBUG_DUMP_LIMIT = 5;

Deno.serve(async (req) => {
  const supa = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const calendars = (Deno.env.get("GCAL_CALENDAR_IDS") || "").split(",").map((s) => s.trim()).filter(Boolean);

  const startTime = new Date();
  console.log(`🚀 Starting Google Calendar sync at ${startTime.toISOString()}`);

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error("Failed to get access token:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const results: Array<{ calendar_id: string; synced: number }> = [];

  for (const calendar_id of calendars) {
    let synced = 0;
    let status = "success";
    let error_message: string | null = null;
    const started_at = new Date();

    try {
      const eventsRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar_id)}/events?singleEvents=true&orderBy=startTime&timeMin=${new Date().toISOString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!eventsRes.ok) {
        throw new Error(`Google API error ${eventsRes.status}: ${await eventsRes.text()}`);
      }

      const eventsData = await eventsRes.json();
      const events = eventsData.items ?? [];

      for (const e of events) {
        const eventId = e.id;
        // Prefer timezone-aware dateTime fields if provided by Google
        const startRaw = e.start?.dateTime ?? e.start?.date;
        const endRaw = e.end?.dateTime ?? e.end?.date;
        if (!eventId || !startRaw || !endRaw) continue;
        if (e.status === "cancelled") continue;

        // Optional debug dump: store raw event JSON (short) for first few events when enabled
        if (Deno.env.get("DEBUG_GCAL_DUMP") === "true" && debugDumpCount < DEBUG_DUMP_LIMIT) {
          debugDumpCount++;
          try {
            await fetch(`${supa}/rest/v1/gcal_sync_event_log`, {
              method: "POST",
              headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal"
              },
              body: JSON.stringify([{
                sync_log_id: null,
                calendar_id,
                event_id: eventId,
                action: "debug-dump",
                message: JSON.stringify({ id: eventId, summary: e.summary ?? null }).slice(0, 3000),
                created_at: new Date().toISOString()
              }])
            }).catch(()=>{});
          } catch (ex) {}
        }

        // Title/summary from Google event (may be empty)
        const title = (typeof e.summary === "string" && e.summary.trim().length > 0) ? e.summary.trim() : null;

        // Pickup extraction
        const pickup = extractPickupFromEvent(e);

        // Booking detection: title contains "Driving Lesson" OR pickup exists
        const titleLooksLikeLesson = title ? /driving lesson/i.test(title) : false;
        const hasPickup = Boolean(pickup && String(pickup).trim() !== "");
        const isBooking = titleLooksLikeLesson || hasPickup;

        // Calculate duration in minutes (best-effort)
        let durationMinutes: number | null = null;
        try {
          const s = new Date(startRaw);
          const en = new Date(endRaw);
          if (!isNaN(s.getTime()) && !isNaN(en.getTime())) {
            durationMinutes = Math.round((en.getTime() - s.getTime()) / 60000);
          }
        } catch (ex) {
          durationMinutes = null;
        }

        // Infer service code
        const inferredService = inferServiceCodeFromTitleAndDuration(title, durationMinutes);
        const service_code_to_send = inferredService; // may be null
        const price_to_send = null; // keep price null for now

        // Extract contact info
        const contact = extractContactFromEvent(e);
        const emailCandidate = contact.email || e.attendees?.[0]?.email || e.creator?.email || "unknown@example.com";
        const firstNameCandidate = contact.first_name || (typeof e.attendees?.[0]?.displayName === "string" ? (e.attendees[0].displayName.split(" ",2)[0] || null) : null);
        const lastNameCandidate  = contact.last_name  || (typeof e.attendees?.[0]?.displayName === "string" ? (e.attendees[0].displayName.split(" ",2)[1] || null) : null);

        const email = emailCandidate;
        const first_name = firstNameCandidate;
        const last_name = lastNameCandidate;
        const mobile = contact.mobile || null;

        // Build RPC payload — note: p_start/p_end are sent as raw Google date strings (prefer dateTime)
        const payload = {
          p_google_event_id: eventId,
          p_calendar_id: calendar_id,
          p_client_email: email,
          p_first_name: first_name ?? null,
          p_last_name: last_name ?? null,
          p_mobile: mobile,
          p_service_code: service_code_to_send,
          p_price_cents: price_to_send,
          p_start: startRaw,
          p_end: endRaw,
          p_pickup: pickup ?? null,
          p_extended: e,
          p_is_booking: isBooking,
          p_title: title
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

        if (upRes.ok) synced++;
        else {
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

    // Logging the sync run in gcal_sync_log (best effort)
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
  return new Response(JSON.stringify({
    ok: true,
    started_at: startTime.toISOString(),
    finished_at: endTime.toISOString(),
    results,
  }), {
    headers: { "Content-Type": "application/json" },
  });
});