// Enhanced Field Mapper
// POST JSON { calendar_id: "<calendar id>" }
// Detects name/email/phone/pickup from Google Calendar event fields
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON

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

/* --- HTML description parser (copied from gcal-parsers.ts) --- */
const EMAIL_RX = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i;
const PHONE_RX = /(\+?\d[\d\-\s\(\)]{5,}\d)/;

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

  for (const l of lines) {
    const m = l.match(EMAIL_RX);
    if (m) { email = m[0]; break; }
  }

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toLowerCase();

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

  if (mobile) mobile = mobile.replace(/[^\d+]/g, "");
  const parts = name ? name.trim().split(/\s+/, 2) : [];
  const first_name = parts[0] || null;
  const last_name = parts.length > 1 ? parts[1] : null;

  return { first_name, last_name, email, mobile, pickup };
}

/* --- Simplified detector --- */
function detectFieldMappings(events: any[]) {
  let detected: any = { first_name: null, last_name: null, email: null, mobile: null, pickup: null };
  for (const e of events ?? []) {
    const desc = parseDescriptionFields(e.description);
    if (desc.first_name && !detected.first_name) detected.first_name = desc.first_name;
    if (desc.last_name && !detected.last_name) detected.last_name = desc.last_name;
    if (desc.email && !detected.email) detected.email = desc.email;
    if (desc.mobile && !detected.mobile) detected.mobile = desc.mobile;
    if (desc.pickup && !detected.pickup) detected.pickup = desc.pickup;
  }
  return detected;
}

/* --- Fetch with timeout --- */
async function safeFetch(url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw new Error(`Fetch timeout or error: ${err}`);
  }
}

/* --- Main handler --- */
Deno.serve(async (req) => {
  try {
    if (req.method !== "POST")
      return new Response(JSON.stringify({ ok: false, error: "Use POST with JSON: { calendar_id }" }), { status: 400 });

    const body = await req.json().catch(() => ({}));
    const calendar_id = String(body?.calendar_id || "").trim();
    if (!calendar_id)
      return new Response(JSON.stringify({ ok: false, error: "Missing calendar_id" }), { status: 400 });

    const supa = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supa || !key)
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

    const accessToken = await getAccessToken();
    const now = new Date();
    const past = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
    const future = new Date(now.getTime() + 14 * 24 * 3600 * 1000);

    const listUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendar_id
    )}/events?singleEvents=true&orderBy=startTime&timeMin=${past.toISOString()}&timeMax=${future.toISOString()}&maxResults=100`;

    const listRes = await safeFetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!listRes.ok) {
      const txt = await listRes.text().catch(() => "(no text)");
      return new Response(JSON.stringify({ ok: false, error: `Google API error ${listRes.status}`, detail: txt }), { status: 502 });
    }

    const listData = await listRes.json();
    const events = listData.items ?? [];
    const mapping = detectFieldMappings(events);

    const persist = [{
      calendar_id,
      field_map: mapping,
      updated_at: new Date().toISOString()
    }];

    await fetch(`${supa}/rest/v1/gcal_state?on_conflict=calendar_id`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(persist)
    }).catch(() => {});

    return new Response(JSON.stringify({ ok: true, mapping }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("field-mapper error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});
