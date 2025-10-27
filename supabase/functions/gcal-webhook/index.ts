// supabase/functions/gcal-webhook/index.ts
// Webhook: verify channel token, log ping, trigger sync for real changes
Deno.serve(async (req) => {
  try {
    const supa = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supa || !key) return new Response("ok");
    
    const h = req.headers;
    const tokenHdr = h.get("X-Goog-Channel-Token") ?? "";
    const channelId = h.get("X-Goog-Channel-ID") ?? h.get("X-Goog-Channel-Id") ?? "";
    const resourceId = h.get("X-Goog-Resource-ID") ?? h.get("X-Goog-Resource-Id") ?? "";
    const state = h.get("X-Goog-Resource-State") ?? "";
    const msgNum = h.get("X-Goog-Message-Number") ?? "";
    
    // Auth check
    const expected = (Deno.env.get("GCAL_CHANNEL_TOKEN") ?? "").trim();
    const authed = expected && tokenHdr === expected;
    
    // Resolve calendar_id
    let calendar_id = null;
    try {
      const url = `${supa}/rest/v1/gcal_state` +
        `?channel_id=eq.${encodeURIComponent(channelId)}` +
        `&resource_id=eq.${encodeURIComponent(resourceId)}` +
        `&select=calendar_id&limit=1`;
      const res = await fetch(url, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length) {
          calendar_id = rows[0]?.calendar_id ?? null;
        }
      }
    } catch {}
    
    // Log the ping
    const payload = [{
      calendar_id,
      channel_id: channelId,
      resource_id: resourceId,
      resource_state: state,
      message_number: msgNum || null,
      processed: false,
    }];
    await fetch(`${supa}/rest/v1/gcal_webhook_log`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
    
    // TRIGGER SYNC if authenticated and real change (not just "sync" ping)
    if (authed && state === "exists") {
      const projectRef = new URL(supa).host.split(".")[0];
      const syncUrl = `https://${projectRef}.functions.supabase.co/gcal-sync`;
      
      // Fire and forget - don't wait for sync to complete
      fetch(syncUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch(() => {}); // Ignore errors
    }
    
    return new Response("ok");
  } catch {
    return new Response("ok");
  }
});