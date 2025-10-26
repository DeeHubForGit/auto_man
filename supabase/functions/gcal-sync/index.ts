// Google Calendar → Supabase Booking Sync (v4.1 - With Cancellation Handling)
// =================================================================
// Extracts contact info from HTML descriptions and handles cancellations

import { parseGcalEvent } from "../_shared/parseEvent.ts";

// ---------- ACCESS TOKEN LOGIC ----------
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
  if (!tok.access_token) throw new Error("Token error");
  return tok.access_token;
}

// ---------- HTML DESCRIPTION PARSER ----------
const EMAIL_RX = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i;

function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  let s = String(html);
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\s*p\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\/?[^>]+(>|$)/g, "");
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/gi, "&");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");
  const lines = s.split(/\r?\n/).map(l => l.trim());
  return lines.join("\n").replace(/\n{2,}/g, "\n\n").trim();
}

function parseDescriptionFields(descHtml: string | null | undefined) {
  const text = htmlToText(descHtml);
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let name: string | null = null;
  let email: string | null = null;
  let mobile: string | null = null;
  let pickup: string | null = null;

  // Find email with regex first
  for (const l of lines) {
    const m = l.match(EMAIL_RX);
    if (m) { 
      email = m[0];
      break; 
    }
  }

  // Parse line by line for structured fields
  for (let i = 0; i < lines.length; i++) {
    if (!name && /^booked by$/i.test(lines[i])) {
      if (i + 1 < lines.length) {
        name = lines[i + 1];
        if (!email && i + 2 < lines.length) {
          const m = lines[i + 2].match(EMAIL_RX);
          if (m) email = m[0];
        }
      }
    }
    if (!mobile && /^mobile$/i.test(lines[i]) && i + 1 < lines.length) {
      mobile = lines[i + 1];
    }
    if (!pickup && /^pickup address$/i.test(lines[i]) && i + 1 < lines.length) {
      pickup = lines[i + 1];
    }
  }

  // Clean mobile
  if (mobile) mobile = mobile.replace(/[^\d+]/g, "");
  
  // Split name with limit of 2 (first name + everything else as last name)
  const parts = name ? name.trim().split(/\s+/, 2) : [];
  const first_name = parts[0] || null;
  const last_name = parts.length > 1 ? parts[1] : null;

  return { first_name, last_name, email, mobile, pickup };
}

// ---------- UNIFIED FIELD EXTRACTOR ----------
function extractFieldsFromEvent(e: any) {
  // 1. Start with HTML description parsing (most reliable for Google appointment bookings)
  const fromDesc = parseDescriptionFields(e.description);
  let { first_name, last_name, email, mobile, pickup } = fromDesc;

  // 2. Use top-level 'location' field as fallback for pickup
  if (!pickup && e.location?.trim()) {
    pickup = e.location.trim();
  }

  // 3. Override with extended properties if they exist (highest priority)
  const ep = e.extendedProperties?.private || e.extendedProperties?.shared || {};
  for (const [k, v] of Object.entries(ep)) {
    if (typeof v !== "string" || !v.trim()) continue;
    const val = v.trim();
    const key = k.toLowerCase();
    if (key.includes("first")) first_name = val;
    else if (key.includes("last")) last_name = val;
    else if (key.includes("email")) email = val;
    else if (key.includes("mobile") || key.includes("phone")) mobile = val.replace(/[^\d+]/g, "");
    else if (key.includes("pickup")) pickup = val;
  }

  // 4. Fallback for name from event title, e.g., "Lesson (John Smith)"
  if (!first_name && typeof e.summary === "string") {
    const match = e.summary.match(/\(([^)]+)\)/);
    if (match) {
      const parts = match[1].trim().split(/\s+/, 2);
      if (parts.length > 0) {
        first_name = parts[0];
        last_name = parts.length > 1 ? parts[1] : null;
      }
    }
  }

  // 5. Final fallback for email from attendee list
  if (!email && Array.isArray(e.attendees)) {
    const guest = e.attendees.find((a: any) => a.email && !a.self);
    if (guest) email = guest.email;
  }

  // 6. Final cleanup
  if (email && !email.includes("@")) email = null;
  if (mobile && mobile.length < 6) mobile = null;

  return { first_name, last_name, email, mobile, pickup_location: pickup };
}

// ---------- SERVICE CODE ----------
function mapDurationToAutoServiceCode(mins: number | null) {
  if (mins === null) return null;
  if (Math.abs(mins - 60) <= 10) return "auto_60";
  if (Math.abs(mins - 90) <= 15) return "auto_90";
  if (Math.abs(mins - 120) <= 20) return "auto_120";
  return null;
}
function inferServiceCode(title: string | null, mins: number | null) {
  if (!title) return null;
  if (/senior/i.test(title)) return mapDurationToAutoServiceCode(mins)?.replace("auto_", "senior_auto_");
  if (/manual/i.test(title)) return mapDurationToAutoServiceCode(mins)?.replace("auto_", "manual_");
  return mapDurationToAutoServiceCode(mins);
}

// ---------- MAIN FUNCTION ----------
Deno.serve(async () => {
  const supa = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const calendars = (Deno.env.get("GCAL_CALENDAR_IDS") || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const token = await getAccessToken();
  const results: any[] = [];

  for (const calendar_id of calendars) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar_id)}/events?singleEvents=true&orderBy=startTime&timeMin=${new Date().toISOString()}&showDeleted=true`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const events = data.items ?? [];
    let synced = 0;
    let cancelled = 0;

    for (const e of events) {
      const start = e.start?.dateTime ?? e.start?.date;
      const end = e.end?.dateTime ?? e.end?.date;
      if (!start || !end) continue;

      // Handle cancelled events
      if (e.status === "cancelled") {
        const cancelRes = await fetch(`${supa}/rest/v1/rpc/mark_booking_cancelled`, {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_google_event_id: e.id,
          }),
        });
        if (cancelRes.ok) cancelled++;
        continue;
      }

      // Process active events
      const durationMinutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
      const parsed = parseGcalEvent(e);
      const fields = extractFieldsFromEvent(e);

      const payload = {
        p_google_event_id: e.id,
        p_calendar_id: calendar_id,
        p_client_email: fields.email,
        p_first_name: fields.first_name,
        p_last_name: fields.last_name,
        p_mobile: fields.mobile,
        p_service_code: parsed.service_code ?? inferServiceCode(e.summary, durationMinutes),
        p_price_cents: parsed.price_cents ?? null,
        p_start: start,
        p_end: end,
        p_pickup: fields.pickup_location ?? parsed.pickup_location ?? null,
        p_extended: true,
        p_is_booking: true,
        p_title: e.summary ?? null,
      };

      const up = await fetch(`${supa}/rest/v1/rpc/upsert_booking_from_google`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (up.ok) synced++;
    }
    results.push({ calendar_id, synced, cancelled });
  }

  return new Response(JSON.stringify({ ok: true, results }), { headers: { "Content-Type": "application/json" } });
});