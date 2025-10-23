// supabase/functions/ping/index.ts
// Minimal heartbeat. No auth. Returns timestamp and request URL.

Deno.serve((req) => {
  return new Response(
    JSON.stringify({
      ok: true,
      fn: "ping",
      url: req.url,
      now: new Date().toISOString(),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
