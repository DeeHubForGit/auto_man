// supabase/functions/stripe-webhook/index.ts
// Handle Stripe webhook events for payment processing
// Usage: POST /functions/v1/stripe-webhook (called by Stripe)
// Headers: stripe-signature
// Body: Stripe event JSON
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
// Using npm:stripe for better Supabase Edge Function / Deno compatibility
import Stripe from "npm:stripe@14.11.0";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "stripe-signature, content-type",
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
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      console.error("[stripe-webhook] Missing required environment variables");
      return json({ error: "Server not configured" }, 500);
    }

    // Initialize Stripe
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    // Get Stripe signature
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      console.error("[stripe-webhook] Missing stripe-signature header");
      return json({ error: "Missing stripe-signature" }, 400);
    }

    // Get raw body
    const body = await req.text();

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
      console.log("[stripe-webhook] Signature verified successfully");
    } catch (err) {
      console.error("[stripe-webhook] Signature verification failed:", err);
      return json({ error: "Invalid signature" }, 400);
    }

    console.log(`[stripe-webhook] Received event: ${event.type}, id: ${event.id}`);

    // Create Supabase admin client
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[stripe-webhook] Checkout session completed: ${session.id}`);

        // Get booking ID from metadata
        const bookingId = session.metadata?.booking_id;
        if (!bookingId) {
          console.error("[stripe-webhook] No booking_id in session metadata");
          return json({ error: "No booking_id in metadata" }, 400);
        }

        // Get payment intent ID
        const paymentIntentId = session.payment_intent as string;
        if (!paymentIntentId) {
          console.error("[stripe-webhook] No payment_intent in session");
          return json({ error: "No payment_intent" }, 400);
        }

        // Retrieve payment intent to get payment method details
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
          expand: ['payment_method'],
        });

        const paymentMethod = paymentIntent.payment_method as Stripe.PaymentMethod | null;
        let paymentMethodSummary = null;

        if (paymentMethod && paymentMethod.card) {
          const card = paymentMethod.card;
          paymentMethodSummary = `${card.brand.charAt(0).toUpperCase() + card.brand.slice(1)} ending ${card.last4} exp ${String(card.exp_month).padStart(2, '0')}/${card.exp_year}`;
        }

        console.log(`[stripe-webhook] Payment method summary: ${paymentMethodSummary}`);

        // Update booking with payment details
        const { error: updateError } = await supabase
          .from("booking")
          .update({
            is_paid: true,
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: paymentIntentId,
            stripe_payment_status: 'paid',
            paid_at: new Date().toISOString(),
            payment_method_summary: paymentMethodSummary,
          })
          .eq("id", bookingId);

        if (updateError) {
          console.error("[stripe-webhook] Failed to update booking:", updateError);
          return json({ error: "Failed to update booking" }, 500);
        }

        console.log(`[stripe-webhook] Updated booking ${bookingId} as paid`);

        // Update client with Stripe customer ID and default payment method if available
        const customerId = session.customer as string;
        const clientId = session.metadata?.client_id;

        if (customerId && clientId) {
          const updates: Record<string, string> = {
            stripe_customer_id: customerId,
          };

          // If payment method was saved, update default payment method ID
          if (paymentMethod) {
            updates.stripe_default_payment_method_id = paymentMethod.id;
          }

          const { error: clientUpdateError } = await supabase
            .from("client")
            .update(updates)
            .eq("id", clientId);

          if (clientUpdateError) {
            console.error("[stripe-webhook] Failed to update client:", clientUpdateError);
            // Don't fail the webhook - payment was successful
          } else {
            console.log(`[stripe-webhook] Updated client ${clientId} with Stripe customer and payment method`);
          }
        }

        break;
      }

      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[stripe-webhook] Async payment succeeded: ${session.id}`);

        const bookingId = session.metadata?.booking_id;
        if (!bookingId) {
          console.error("[stripe-webhook] No booking_id in session metadata");
          return json({ error: "No booking_id in metadata" }, 400);
        }

        // Update booking as paid
        const { error: updateError } = await supabase
          .from("booking")
          .update({
            is_paid: true,
            stripe_payment_status: 'paid',
            paid_at: new Date().toISOString(),
          })
          .eq("id", bookingId);

        if (updateError) {
          console.error("[stripe-webhook] Failed to update booking for async payment:", updateError);
          return json({ error: "Failed to update booking" }, 500);
        }

        console.log(`[stripe-webhook] Updated booking ${bookingId} for async payment success`);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`[stripe-webhook] Payment failed: ${paymentIntent.id}`);

        // Find booking by payment intent ID
        const { data: booking, error: findError } = await supabase
          .from("booking")
          .select("id")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .single();

        if (findError || !booking) {
          console.log("[stripe-webhook] Booking not found for failed payment");
          return json({ received: true });
        }

        // Update booking status to failed
        const { error: updateError } = await supabase
          .from("booking")
          .update({
            stripe_payment_status: 'failed',
          })
          .eq("id", booking.id);

        if (updateError) {
          console.error("[stripe-webhook] Failed to update booking for failed payment:", updateError);
        }

        console.log(`[stripe-webhook] Updated booking ${booking.id} status to failed`);
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return json({ received: true });

  } catch (err) {
    console.error("[stripe-webhook] Unexpected error:", err);
    return json({ error: "Unexpected error", details: String(err) }, 500);
  }
});
