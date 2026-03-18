// supabase/functions/get-billing-summary/index.ts
// Get safe billing summary for authenticated client
// Usage: GET /functions/v1/get-billing-summary
// Authorization: Bearer <user_access_token>
// Returns: Safe payment method summary and billing details
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, STRIPE_SECRET_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.11.0?target=deno';

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
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
  if (req.method !== "GET") return json({ error: "Method Not Allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !STRIPE_SECRET_KEY) {
      console.error("[get-billing-summary] Missing required environment variables");
      return json({ error: "Server not configured" }, 500);
    }

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[get-billing-summary] Missing Authorization header");
      return json({ error: "Unauthorized: Missing authorization header" }, 401);
    }

    // Debug auth header (without exposing token)
    const hasBearer = authHeader.startsWith("Bearer ");
    console.log("[get-billing-summary] Auth check:", {
      hasAuthHeader: !!authHeader,
      hasBearer,
      headerLength: authHeader.length
    });

    if (!hasBearer) {
      console.error("[get-billing-summary] Authorization header not Bearer format");
      return json({ error: "Unauthorized: Invalid authorization format" }, 401);
    }

    // Extract token from Bearer header
    const token = authHeader.replace("Bearer ", "").trim();
    console.log("[get-billing-summary] Token extracted:", {
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
      console.error("[get-billing-summary] Auth failed:", authError);
      return json({ error: "Unauthorized: Invalid token" }, 401);
    }

    console.log("[get-billing-summary] Auth success:", {
      hasUser: !!user,
      userId: user.id,
      hasEmail: !!user.email
    });

    const userEmail = user.email?.trim().toLowerCase();
    if (!userEmail) {
      return json({ error: "User email not found" }, 401);
    }

    console.log(`[get-billing-summary] Authenticated user: ${user.id}, email: ${userEmail}`);

    // Find the client record for this user
    const { data: client, error: clientError } = await supabase
      .from("client")
      .select("id, email, first_name, last_name, stripe_customer_id, stripe_default_payment_method_id")
      .ilike("email", userEmail)
      .single();

    if (clientError || !client) {
      console.error("[get-billing-summary] Client not found:", clientError);
      return json({ error: "Client record not found" }, 404);
    }

    console.log(`[get-billing-summary] Found client: ${client.id}`);

    // If no Stripe customer, return empty summary
    if (!client.stripe_customer_id) {
      console.log("[get-billing-summary] No Stripe customer ID");
      return json({
        has_saved_payment_method: false,
        card_brand: null,
        card_last4: null,
        exp_month: null,
        exp_year: null,
        billing_name: null,
        billing_email: client.email,
      });
    }

    // Initialize Stripe
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Retrieve customer from Stripe
    const customer = await stripe.customers.retrieve(client.stripe_customer_id);

    if (customer.deleted) {
      console.log("[get-billing-summary] Stripe customer was deleted");
      return json({
        has_saved_payment_method: false,
        card_brand: null,
        card_last4: null,
        exp_month: null,
        exp_year: null,
        billing_name: null,
        billing_email: client.email,
      });
    }

    // Get default payment method if available
    let paymentMethod: Stripe.PaymentMethod | null = null;
    
    if (client.stripe_default_payment_method_id) {
      try {
        paymentMethod = await stripe.paymentMethods.retrieve(client.stripe_default_payment_method_id);
      } catch (err) {
        console.error("[get-billing-summary] Failed to retrieve payment method:", err);
        // Continue - we'll try to get it from customer default
      }
    }

    // If no payment method yet, try to get default from customer
    if (!paymentMethod && customer.invoice_settings?.default_payment_method) {
      try {
        paymentMethod = await stripe.paymentMethods.retrieve(
          customer.invoice_settings.default_payment_method as string
        );
      } catch (err) {
        console.error("[get-billing-summary] Failed to retrieve customer default payment method:", err);
      }
    }

    // If still no payment method, list customer's payment methods
    if (!paymentMethod) {
      try {
        const paymentMethods = await stripe.paymentMethods.list({
          customer: client.stripe_customer_id,
          type: 'card',
          limit: 1,
        });
        
        if (paymentMethods.data.length > 0) {
          paymentMethod = paymentMethods.data[0];
        }
      } catch (err) {
        console.error("[get-billing-summary] Failed to list payment methods:", err);
      }
    }

    // Build response
    if (!paymentMethod || !paymentMethod.card) {
      console.log("[get-billing-summary] No payment method found");
      return json({
        has_saved_payment_method: false,
        card_brand: null,
        card_last4: null,
        exp_month: null,
        exp_year: null,
        billing_name: customer.name || null,
        billing_email: customer.email || client.email,
      });
    }

    const card = paymentMethod.card;
    
    console.log(`[get-billing-summary] Found payment method: ${card.brand} ending ${card.last4}`);

    return json({
      has_saved_payment_method: true,
      card_brand: card.brand,
      card_last4: card.last4,
      exp_month: card.exp_month,
      exp_year: card.exp_year,
      billing_name: customer.name || [client.first_name, client.last_name].filter(Boolean).join(' ') || null,
      billing_email: customer.email || client.email,
    });

  } catch (err) {
    console.error("[get-billing-summary] Unexpected error:", err);
    return json({ error: "Unexpected error", details: String(err) }, 500);
  }
});
