// supabase/functions/revoke-user-sessions/index.ts
// Revoke all Supabase sessions/refresh tokens for the current authenticated user
// Usage: POST /functions/v1/revoke-user-sessions
// Authorization: Bearer <user_access_token>
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

type Json = Record<string, unknown>;

function json(body: Json, init: number | ResponseInit = 200) {
  const initObj = typeof init === "number" ? { status: init } : init;
  return new Response(JSON.stringify(body), {
    ...initObj,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      ...(initObj as ResponseInit).headers || {},
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ error: "Server not configured" }, 500);
    }

    // Get and verify JWT from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized: Missing or invalid authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "").trim();

    // Create admin client for verification and revocation
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Verify the JWT and get the authenticated user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error("[revoke-user-sessions] Auth verification failed:", authError);
      return json({ error: "Unauthorized: Invalid token" }, 401);
    }

    console.log("[revoke-user-sessions] Verified user:", user.id);

    // Revoke all sessions for this user using admin API
    // scope: 'global' revokes all refresh tokens/sessions across all devices
    const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(user.id, 'global');

    if (signOutError) {
      console.error("[revoke-user-sessions] Failed to revoke sessions:", signOutError);
      return json({ error: "Failed to revoke sessions", details: signOutError.message }, 500);
    }

    console.log("[revoke-user-sessions] Successfully revoked all sessions for user:", user.id);

    return json({ ok: true });
  } catch (err) {
    console.error("[revoke-user-sessions] Unexpected error:", err);
    return json({ error: "Unexpected error", details: String(err) }, 500);
  }
});
