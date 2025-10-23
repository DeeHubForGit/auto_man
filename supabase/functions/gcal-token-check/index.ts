// supabase/functions/gcal-token-check/index.ts
// Minimal: try to mint a Google OAuth access token using the service account.
// Returns { ok: true, tokenLen } on success, or { ok: false, error }.

const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

function b64url(s: string) {
  return btoa(s).replace(/=+$/,"").replace(/\+/g,"-").replace(/\//g,"_");
}

async function getAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") ?? "";
  if (!raw) throw new Error("Missing env GOOGLE_SERVICE_ACCOUNT_JSON");
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
  const pkcs8 = pem.replace(/-----.*?-----/g, "").replace(/\s+/g, "");
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
  if (!res.ok || !tok.access_token) {
    throw new Error(`token error: ${res.status} ${JSON.stringify(tok)}`);
  }
  return tok.access_token as string;
}

Deno.serve(async () => {
  try {
    const t = await getAccessToken();
    return new Response(JSON.stringify({ ok: true, tokenLen: String(t).length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
