// supabase/functions/create-stripe-portal-session/index.ts
// Create a Stripe Customer Portal session for payment method management
// Usage: POST /functions/v1/create-stripe-portal-session
// Authorization: Bearer <user_access_token>
// Returns: { portalUrl: string }
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, STRIPE_SECRET_KEY, SITE_URL

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.11.0?target=deno';

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

type Json = Record<string, unknown>;

function json(body: Json, init: number | ResponseInit = 200) {
  const initObj = typeof init === "number" ? { status: init } : init;
  return new Response(JSON.stringify(body), {
    ...initObj,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders,
      ...(initObj as ResponseInit).headers || {},
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const SITE_URL = Deno.env.get("SITE_URL");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !STRIPE_SECRET_KEY) {
      console.error("[create-stripe-portal-session] Missing required environment variables");
      return json({ error: "Server not configured" }, 500);
    }

    if (!SITE_URL) {
      console.error("[create-stripe-portal-session] SITE_URL not configured");
      return json({ error: "Payment system not configured. Please contact support." }, 500);
    }

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[create-stripe-portal-session] Missing Authorization header");
      return json({ error: "Unauthorized: Missing authorization header" }, 401);
    }

    // Debug auth header (without exposing token)
    const hasBearer = authHeader.startsWith("Bearer ");
    console.log("[create-stripe-portal-session] Auth check:", {
      hasAuthHeader: !!authHeader,
      hasBearer,
      headerLength: authHeader.length
    });

    if (!hasBearer) {
      console.error("[create-stripe-portal-session] Authorization header not Bearer format");
      return json({ error: "Unauthorized: Invalid authorization format" }, 401);
    }

    // Extract token from Bearer header
    const token = authHeader.replace("Bearer ", "").trim();
    console.log("[create-stripe-portal-session] Token extracted:", {
      hasToken: !!token,
      tokenLength: token?.length
    });

    // Create Supabase client with user's auth token
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error("[create-stripe-portal-session] Auth failed:", authError);
      return json({ error: "Unauthorized: Invalid token" }, 401);
    }

    console.log("[create-stripe-portal-session] Auth success:", {
      hasUser: !!user,
      userId: user.id,
      hasEmail: !!user.email
    });

    const userEmail = user.email?.trim().toLowerCase();
    if (!userEmail) {
      return json({ error: "User email not found" }, 401);
    }

    console.log(`[create-stripe-portal-session] Authenticated user: ${user.id}, email: ${userEmail}`);

    // Find the client record for this user
    const { data: client, error: clientError } = await supabase
      .from("client")
      .select("id, email, stripe_customer_id")
      .ilike("email", userEmail)
      .single();

    if (clientError || !client) {
      console.error("[create-stripe-portal-session] Client not found:", clientError);
      return json({ error: "Client record not found" }, 404);
    }

    // Check if client has a Stripe customer ID
    if (!client.stripe_customer_id) {
      console.error("[create-stripe-portal-session] No Stripe customer ID");
      return json({ error: "No payment methods to manage. Please make a payment first." }, 400);
    }

    console.log(`[create-stripe-portal-session] Found client: ${client.id}, customer: ${client.stripe_customer_id}`);

    // Initialize Stripe
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Create customer portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: client.stripe_customer_id,
      return_url: `${SITE_URL}/portal.html`,
    });

    console.log(`[create-stripe-portal-session] Created portal session: ${session.id}`);

    return json({ portalUrl: session.url });

  } catch (err) {
    console.error("[create-stripe-portal-session] Unexpected error:", err);
    return json({ error: "Unexpected error", details: String(err) }, 500);
  }
});
