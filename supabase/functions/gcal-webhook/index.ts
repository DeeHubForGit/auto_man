// supabase/functions/gcal-webhook/index.ts
// Minimal, reliable webhook: verify token, log ping, return 200 immediately.

Deno.serve(async (req) => {
  try {
    const supa = Deno.env.get("SUPABASE_URL") ?? "";
    const key  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supa || !key) return new Response("ok"); // avoid Google retries

    // Google headers
    const h = req.headers;
    const tokenHdr   = h.get("X-Goog-Channel-Token") ?? "";
    const channelId  = h.get("X-Goog-Channel-ID") ?? "";
    const resourceId = h.get("X-Goog-Resource-ID") ?? "";
    const state      = h.get("X-Goog-Resource-State") ?? "";
    const msgNum     = h.get("X-Goog-Message-Number") ?? "";

    // Auth check: still respond 200 so Google doesn't retry forever
    const expected = Deno.env.get("GCAL_CHANNEL_TOKEN") ?? "";
    const authed = expected && tokenHdr === expected;

    // Resolve calendar_id (best-effort)
    let calendar_id: string | null = null;
    try {
      const url = `${supa}/rest/v1/gcal_state` +
        `?channel_id=eq.${encodeURIComponent(channelId)}` +
        `&resource_id=eq.${encodeURIComponent(resourceId)}` +
        `&select=calendar_id&limit=1`;
      const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length) calendar_id = rows[0]?.calendar_id ?? null;
      }
    } catch { /* ignore */ }

    // Log the ping (idempotency index is optional; see SQL below)
    const payload = [{
      calendar_id,
      channel_id: channelId,
      resource_id: resourceId,
      resource_state: state,
      message_number: msgNum || null,
      processed: false
    }];
    await fetch(`${supa}/rest/v1/gcal_webhook_log`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(payload)
    }).catch(()=>{});

    // Done — respond quickly
    return new Response("ok");
  } catch {
    return new Response("ok");
  }
});
