// supabase/functions/admin-echo/index.ts
Deno.serve(async (req) => {
  const provided = (req.headers.get("x-admin-token") || "").trim();
  const expected = (Deno.env.get("GCAL_CHANNEL_TOKEN") || "").trim();

  const match = provided && expected && provided === expected;

  return new Response(
    JSON.stringify({
      ok: match,
      providedLen: provided.length,
      expectedLen: expected.length,
      note: match ? "Token matched!" : "Token mismatch. Check for spaces/newlines."
    }),
    { status: match ? 200 : 401, headers: { "Content-Type": "application/json" } }
  );
});
