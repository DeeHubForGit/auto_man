// supabase/functions/gcal-list/index.ts
// Simple debug function: list upcoming Google Calendar events
// -----------------------------------------------------------
// - Uses the same service-account JSON as gcal-sync
// - Reads calendar IDs from GCAL_CALENDAR_IDS (comma-separated)
// - Returns a JSON array of events with only the key fields
//
// This does NOT write to Supabase or send SMS/email.

const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

function b64url(s: string) {
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) {
    throw new Error("Missing env: GOOGLE_SERVICE_ACCOUNT_JSON");
  }

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

  const headerPart = b64url(JSON.stringify(header));
  const claimsPart = b64url(JSON.stringify(claims));
  const data = `${headerPart}.${claimsPart}`;

  const pem = sa.private_key as string;
  if (!pem) {
    throw new Error("Service account JSON missing private_key");
  }

  const pkcs8 = pem.replace(/-----.*?-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pkcs8), (c) => c.charCodeAt(0));

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

  const sigPart = b64url(String.fromCharCode(...new Uint8Array(sig)));
  const jwt = `${data}.${sigPart}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tok = await res.json();
  if (!tok.access_token) {
    throw new Error("Token error");
  }

  return tok.access_token;
}

Deno.serve(async () => {
  try {
    const calendars = (Deno.env.get("GCAL_CALENDAR_IDS") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (calendars.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: "No GCAL_CALENDAR_IDS configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const token = await getAccessToken();

    // Look ahead 14 days for debugging
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const allEvents: any[] = [];

    for (const calendarId of calendars) {
      console.log(`[gcal-list] Fetching events for calendar ${calendarId}`);

      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      );
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("timeMin", timeMin);
      url.searchParams.set("timeMax", timeMax);
      url.searchParams.set("showDeleted", "true");

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(
          `[gcal-list] ERROR ${res.status} fetching ${calendarId}: ${text}`,
        );
        continue;
      }

      const data = await res.json();
      const items = data.items ?? [];

      console.log(
        `[gcal-list] Got ${items.length} event(s) for calendar ${calendarId}`,
      );

      for (const ev of items) {
        const start = ev.start?.dateTime ?? ev.start?.date ?? null;
        const end = ev.end?.dateTime ?? ev.end?.date ?? null;

        allEvents.push({
          calendar_id: calendarId,
          id: ev.id,
          summary: ev.summary ?? null,
          status: ev.status ?? null,
          eventType: ev.eventType ?? "default",
          hasWorkingLocation: !!ev.workingLocationProperties,
          start,
          end,
        });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, count: allEvents.length, events: allEvents }, null, 2),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[gcal-list] ERROR", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
