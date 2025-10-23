// Google Calendar → Supabase Booking Sync with Logging
// ======================================================

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

  const tok = await res.json();
  if (!res.ok || !tok.access_token)
    throw new Error(`Token error: ${res.status} ${JSON.stringify(tok)}`);

  return tok.access_token;
}

Deno.serve(async () => {
  const supa = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const accessToken = await getAccessToken();

  try {
    // Step 1: find unprocessed webhook logs
    const resLogs = await fetch(`${supa}/rest/v1/gcal_webhook_log?processed=eq.false`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const logs = await resLogs.json();
    if (!Array.isArray(logs) || logs.length === 0) {
      return new Response(JSON.stringify({ ok: true, msg: "No unprocessed webhook logs" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Group webhook entries by calendar_id
    const byCalendar = new Map<string, any[]>();
    for (const row of logs) {
      if (!row.calendar_id) continue;
      if (!byCalendar.has(row.calendar_id)) byCalendar.set(row.calendar_id, []);
      byCalendar.get(row.calendar_id)!.push(row);
    }

    const results: Array<{ calendar_id: string; synced: number }> = [];

    // Process each calendar
    for (const [calendar_id] of byCalendar) {
      // Step 2: Create sync log entry
      let syncLogId: number | null = null;
      try {
        const res = await fetch(`${supa}/rest/v1/gcal_sync_log`, {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify([{ calendar_id, status: "running" }]),
        });

        if (!res.ok) {
          console.error("Failed to create sync log entry:", await res.text());
        } else {
          const body = await res.json();
          if (Array.isArray(body) && body.length > 0) {
            syncLogId = body[0].id;
            console.log(`Started sync log #${syncLogId} for calendar: ${calendar_id}`);
          }
        }
      } catch (logErr) {
        console.error("Error creating log entry:", logErr);
      }

      // Step 3: Perform sync
      let inserted = 0;
      let updated = 0;

      try {
        const stateRes = await fetch(
          `${supa}/rest/v1/gcal_state?calendar_id=eq.${encodeURIComponent(calendar_id)}`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } }
        );
        const state = await stateRes.json();
        const sync_token = state?.[0]?.sync_token ?? null;

        const params = new URLSearchParams({ maxResults: "2500", singleEvents: "true" });
        if (sync_token) params.set("syncToken", sync_token);
        else {
          const now = new Date();
          const past = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
          const future = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
          params.set("timeMin", past.toISOString());
          params.set("timeMax", future.toISOString());
        }

        const listRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar_id)}/events?${params}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const data = await listRes.json();
        if (!listRes.ok) throw new Error(JSON.stringify(data));

        for (const e of data.items ?? []) {
          const start = e.start?.dateTime || e.start?.date;
          const end = e.end?.dateTime || e.end?.date;
          if (!start || !end || e.status === "cancelled") continue;

          const email = e.attendees?.[0]?.email || e.creator?.email || "unknown@example.com";
          const [first_name, last_name] = (e.summary ?? "").split(" ", 2);

          const payload = {
            p_google_event_id: e.id,
            p_calendar_id: calendar_id,
            p_client_email: email,
            p_first_name: first_name ?? null,
            p_last_name: last_name ?? null,
            p_mobile: null,
            p_service_code: "auto_60",
            p_price_cents: 8500,
            p_start: start,
            p_end: end,
            p_pickup: e.location ?? null,
            p_extended: e,
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

          if (upRes.ok) inserted++;
          else updated++;
        }

        // Step 4: Update sync token
        if (data.nextSyncToken) {
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
                sync_token: data.nextSyncToken,
                updated_at: new Date().toISOString(),
              },
            ]),
          });
        }

        // Step 5: Mark success in log
        if (syncLogId) {
          await fetch(`${supa}/rest/v1/gcal_sync_log?id=eq.${syncLogId}`, {
            method: "PATCH",
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              finished_at: new Date().toISOString(),
              status: "success",
              synced_count: data.items?.length ?? 0,
              inserted_count: inserted,
              updated_count: updated,
            }),
          });
        }

        results.push({ calendar_id, synced: data.items?.length ?? 0 });
      } catch (innerErr) {
        console.error(`Calendar ${calendar_id} failed:`, innerErr);
        if (syncLogId) {
          await fetch(`${supa}/rest/v1/gcal_sync_log?id=eq.${syncLogId}`, {
            method: "PATCH",
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              finished_at: new Date().toISOString(),
              status: "failed",
              error_message: String(innerErr),
            }),
          });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("gcal-sync error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
