// supabase/functions/gcal-clean-working-location/index.ts

import { serve } from "https://deno.land/std@0.223.0/http/server.ts";

const GOOGLE_CALENDAR_ID = "darren@automandrivingschool.com.au";
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar";

// ------------------- AUTH -------------------
function b64url(s: string) {
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

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
  const pem = sa.private_key.replace(/-----.*?-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(data),
  );

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
  if (!tok.access_token) throw new Error("Failed to get token");
  return tok.access_token;
}

// ------------------- FETCH EVENTS -------------------
async function listHomeEvents(token: string) {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${GOOGLE_CALENDAR_ID}/events`,
  );
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("showDeleted", "true");
  url.searchParams.set("maxResults", "2500");
  url.searchParams.set("timeMin", "2020-01-01T00:00:00Z"); // GET EVERYTHING

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error("Google API error", await res.text());
    throw new Error("Failed to list events");
  }

  const data = await res.json();
  const items = data.items || [];

  // Filter ONLY junk / workingLocation / Home
  const filtered = items.filter((e: any) =>
    e.eventType === "workingLocation" ||
    e.workingLocationProperties ||
    e.summary === "Home"
  );

  console.log(`[clean] Total items: ${items.length}`);
  console.log(`[clean] Home/workingLocation: ${filtered.length}`);

  return filtered;
}

// ------------------- DELETE -------------------
async function deleteEvent(token: string, id: string) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${GOOGLE_CALENDAR_ID}/events/${id}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  // Treat Google 404 and 410 as "already deleted"
  if (res.status === 404 || res.status === 410) {
    console.log(`[clean] Already deleted: ${id}`);
    return;
  }

  if (!res.ok) {
    console.error(`[clean] Delete failed ${id}:`, await res.text());
    return; // DO NOT THROW — keep going
  }

  console.log(`[clean] Deleted: ${id}`);
}

// ------------------- MAIN -------------------
serve(async () => {
  try {
    const token = await getAccessToken();
    const events = await listHomeEvents(token);

    let count = 0;
    for (const e of events) {
      if (!e.id) continue;
      await deleteEvent(token, e.id);
      count++;
    }

    return new Response(
      JSON.stringify({ ok: true, deleted: count }),
      { headers: { "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("[clean] ERROR:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
