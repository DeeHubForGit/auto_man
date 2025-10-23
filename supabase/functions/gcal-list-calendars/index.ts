// supabase/functions/gcal-list-calendars/index.ts
// Lists calendars visible to the service account (no impersonation).
// Call with Authorization: Bearer <SUPABASE_ANON_KEY>

const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

function b64url(s: string) {
  return btoa(s).replace(/=+$/,"").replace(/\+/g,"-").replace(/\//g,"_");
}

async function getAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") ?? "";
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  const sa = JSON.parse(raw);

  const now = Math.floor(Date.now()/1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const pem = String(sa.private_key ?? "").replace(/-----.*?-----/g,"").replace(/\s+/g,"");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey("pkcs8", der, { name:"RSASSA-PKCS1-v1_5", hash:"SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
  const jwt = `${data}.${b64url(String.fromCharCode(...new Uint8Array(sig)))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type":"application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.access_token) throw new Error(`token error: ${res.status} ${JSON.stringify(tok)}`);
  return tok.access_token as string;
}

Deno.serve(async () => {
  try {
    const access = await getAccessToken();
    const r = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${access}` }
    });
    const json = await r.json();
    if (!r.ok) throw new Error(`calendarList failed: ${r.status} ${JSON.stringify(json)}`);

    // Return id + summary so you can copy the exact calendar id(s)
    const calendars = (json.items ?? []).map((c: any) => ({
      id: c.id,                    // <-- use these in GCAL_CALENDAR_IDS
      summary: c.summary,
      primary: Boolean(c.primary),
      accessRole: c.accessRole,
    }));

    return new Response(JSON.stringify({ ok:true, calendars }), { headers:{ "Content-Type":"application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      headers:{ "Content-Type":"application/json" }, status: 200
    });
  }
});
