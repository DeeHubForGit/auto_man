// supabase/functions/gcal-register-watch/index.ts
// Admin-only: register/renew Google Calendar push notifications (watch channels)
// Auth accepted as: x-admin-token header, Authorization: Bearer <token>, or ?token=

const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

function b64url(s: string) {
  return btoa(s).replace(/=+$/,"").replace(/\+/g,"-").replace(/\//g,"_");
}

async function getAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON");
  const sa = JSON.parse(raw);
  const subject = Deno.env.get("GOOGLE_IMPERSONATE_SUBJECT") || undefined;

  const now = Math.floor(Date.now()/1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims: Record<string, unknown> = {
    iss: sa.client_email,
    scope: GCAL_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  if (subject) claims.sub = subject;

  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;

  const pem = String(sa.private_key ?? "");
  if (!pem) throw new Error("Service account JSON missing private_key");
  const pkcs8 = pem.replace(/-----.*?-----/g,"").replace(/\s+/g,"");
  const der = Uint8Array.from(atob(pkcs8), c => c.charCodeAt(0));

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
  const tok = await res.json();
  if (!res.ok || !tok.access_token) throw new Error(`token error: ${res.status} ${JSON.stringify(tok)}`);
  return tok.access_token as string;
}

function getProvidedAdminToken(req: Request): string {
  const url = new URL(req.url);
  const q = (url.searchParams.get("token") || "").trim();
  const x = (req.headers.get("x-admin-token") || req.headers.get("X-Admin-Token") || "").trim();
  const auth = (req.headers.get("authorization") || req.headers.get("Authorization") || "").trim();
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return q || x || bearer || "";
}

Deno.serve(async (req) => {
  try {
    // Admin auth (diagnostic-free variant)
    const expected = (Deno.env.get("GCAL_CHANNEL_TOKEN") || "").trim();
    const provided = getProvidedAdminToken(req);
    if (!expected || provided !== expected) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorised" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Calendars list
    const calendars = (Deno.env.get("GCAL_CALENDAR_IDS") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!calendars.length) {
      return new Response(JSON.stringify({ ok: false, error: "no calendars configured" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken();

    // Build HTTPS webhook address using forwarded headers
    const fwdHost  = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const fwdProto = req.headers.get("x-forwarded-proto") || "https";
    const address  = `${fwdProto}://${fwdHost}/gcal-webhook`; // force https via proto

    const updates: Array<{ calendar_id: string; payload: any }> = [];
    for (const cal of calendars) {
      const channelId = `automan-${crypto.randomUUID()}`;
      const body = { id: channelId, type: "web_hook", address, token: expected };

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events/watch`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(`watch failed for ${cal}: ${res.status} ${JSON.stringify(json)}`);
      updates.push({ calendar_id: cal, payload: json });
    }

    // Persist channel info (UPSERT on calendar_id)
    const supa = Deno.env.get("SUPABASE_URL")!;
    const key  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const rows = updates.map((u) => ({
      calendar_id: u.calendar_id,
      channel_id: String(u.payload.id ?? ""),
      resource_id: String(u.payload.resourceId ?? ""),
      channel_expiration: u.payload.expiration ? new Date(Number(u.payload.expiration)).toISOString() : null,
      updated_at: new Date().toISOString(),
    }));

    const up = await fetch(`${supa}/rest/v1/gcal_state?on_conflict=calendar_id`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!up.ok) {
      const t = await up.text();
      throw new Error(`supabase upsert failed: ${up.status} ${t}`);
    }

    return new Response(JSON.stringify({ ok: true, address, updates }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
