// supabase/functions/create-stripe-checkout-session/index.ts
// Create a Stripe Checkout Session for booking payment
// Usage: POST /functions/v1/create-stripe-checkout-session
// Authorization: Bearer <user_access_token>
// Body: { bookingId: string }
// Returns: { sessionUrl: string }
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
      console.error("[create-stripe-checkout-session] Missing required environment variables");
      return json({ error: "Server not configured" }, 500);
    }

    if (!SITE_URL) {
      console.error("[create-stripe-checkout-session] SITE_URL not configured");
      return json({ error: "Payment system not configured. Please contact support." }, 500);
    }

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[create-stripe-checkout-session] Missing Authorization header");
      return json({ error: "Unauthorized: Missing authorization header" }, 401);
    }

    // Debug auth header (without exposing token)
    const hasBearer = authHeader.startsWith("Bearer ");
    console.log("[create-stripe-checkout-session] Auth check:", {
      hasAuthHeader: !!authHeader,
      hasBearer,
      headerLength: authHeader.length
    });

    if (!hasBearer) {
      console.error("[create-stripe-checkout-session] Authorization header not Bearer format");
      return json({ error: "Unauthorized: Invalid authorization format" }, 401);
    }

    // Extract token from Bearer header
    const token = authHeader.replace("Bearer ", "").trim();
    console.log("[create-stripe-checkout-session] Token extracted:", {
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
      console.error("[create-stripe-checkout-session] Auth failed:", authError);
      return json({ error: "Unauthorized: Invalid token" }, 401);
    }

    console.log("[create-stripe-checkout-session] Auth success:", {
      hasUser: !!user,
      userId: user.id,
      hasEmail: !!user.email
    });

    const userEmail = user.email?.trim().toLowerCase();
    if (!userEmail) {
      return json({ error: "User email not found" }, 401);
    }

    console.log(`[create-stripe-checkout-session] Authenticated user: ${user.id}, email: ${userEmail}`);

    // Parse request body
    const { bookingId } = await req.json();
    if (!bookingId) {
      return json({ error: "Missing bookingId" }, 400);
    }

    // Find the client record for this user
    const { data: client, error: clientError } = await supabase
      .from("client")
      .select("id, email, first_name, last_name, stripe_customer_id")
      .ilike("email", userEmail)
      .single();

    if (clientError || !client) {
      console.error("[create-stripe-checkout-session] Client not found:", clientError);
      return json({ error: "Client record not found" }, 404);
    }

    console.log(`[create-stripe-checkout-session] Found client: ${client.id}`);

    // Fetch the booking and verify ownership
    const { data: booking, error: bookingError } = await supabase
      .from("booking")
      .select(`
        id,
        client_id,
        price_cents,
        service_code,
        is_paid,
        status,
        start_time,
        stripe_checkout_session_id,
        service:service (
          name,
          short_name
        )
      `)
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("[create-stripe-checkout-session] Booking lookup failed:", bookingError);
      return json({ error: "Booking not found" }, 404);
    }

    // Verify booking belongs to this client
    if (booking.client_id !== client.id) {
      console.error("[create-stripe-checkout-session] Unauthorized: Booking belongs to different client");
      return json({ error: "Unauthorized: This booking does not belong to you" }, 403);
    }

    // Server-side payment eligibility checks
    if (booking.status !== 'confirmed') {
      console.log("[create-stripe-checkout-session] Booking is not confirmed");
      return json({ error: "Only confirmed bookings can be paid" }, 400);
    }

    if (booking.is_paid === true) {
      console.log("[create-stripe-checkout-session] Booking already paid");
      return json({ error: "This booking has already been paid" }, 400);
    }

    if (booking.status === 'cancelled') {
      console.log("[create-stripe-checkout-session] Booking is cancelled");
      return json({ error: "Cannot pay for a cancelled booking" }, 400);
    }

    // Check if booking is in the future
    const bookingStartTime = new Date(booking.start_time);
    const now = new Date();
    if (bookingStartTime <= now) {
      console.log("[create-stripe-checkout-session] Booking is not in the future");
      return json({ error: "Cannot pay for a booking that has already started or passed" }, 400);
    }

    // Check if booking has a price
    if (!booking.price_cents || booking.price_cents <= 0) {
      console.log("[create-stripe-checkout-session] Booking has no price");
      return json({ error: "Booking price not set" }, 400);
    }

    // Initialize Stripe
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Create or retrieve Stripe customer
    let stripeCustomerId = client.stripe_customer_id;

    if (!stripeCustomerId) {
      console.log("[create-stripe-checkout-session] Creating new Stripe customer");
      const customer = await stripe.customers.create({
        email: client.email,
        name: [client.first_name, client.last_name].filter(Boolean).join(' ') || undefined,
        metadata: {
          client_id: client.id,
          source: 'portal_payment',
        },
      });
      
      stripeCustomerId = customer.id;

      // Save Stripe customer ID to client record
      const { error: updateError } = await supabase
        .from("client")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", client.id);

      if (updateError) {
        console.error("[create-stripe-checkout-session] Failed to save Stripe customer ID:", updateError);
        // Continue anyway - we can still process the payment
      }

      console.log(`[create-stripe-checkout-session] Created Stripe customer: ${stripeCustomerId}`);
    } else {
      console.log(`[create-stripe-checkout-session] Using existing Stripe customer: ${stripeCustomerId}`);
      
      // Update Stripe customer details to keep them in sync
      try {
        await stripe.customers.update(stripeCustomerId, {
          email: client.email,
          name: [client.first_name, client.last_name].filter(Boolean).join(' ') || undefined,
        });
        console.log(`[create-stripe-checkout-session] Synced customer details for: ${stripeCustomerId}`);
      } catch (err) {
        console.warn("[create-stripe-checkout-session] Failed to sync customer details:", err);
        // Continue anyway - sync failure shouldn't block payment
      }
    }

    // Check if booking already has an existing checkout session
    if (booking.stripe_checkout_session_id) {
      console.log(`[create-stripe-checkout-session] Booking has existing session: ${booking.stripe_checkout_session_id}`);
      
      try {
        // Try to retrieve the existing session
        const existingSession = await stripe.checkout.sessions.retrieve(booking.stripe_checkout_session_id);
        
        // If session is still open and usable, return its URL instead of creating a new one
        if (existingSession.status === 'open' && existingSession.url) {
          console.log("[create-stripe-checkout-session] Reusing existing open session");
          return json({ sessionUrl: existingSession.url });
        } else {
          console.log(`[create-stripe-checkout-session] Existing session not reusable (status: ${existingSession.status}), creating new one`);
        }
      } catch (retrieveError) {
        // If we can't retrieve the session (expired, invalid, etc.), create a new one
        console.log("[create-stripe-checkout-session] Could not retrieve existing session, creating new one:", retrieveError);
      }
    }

    // Create Stripe Checkout Session
    const serviceName =
      booking.service?.name ||
      booking.service?.short_name ||
      booking.service_code ||
      'Driving Lesson';

    console.log("[create-stripe-checkout-session] Creating new checkout session");

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'aud',
              product_data: {
                name: serviceName,
                description: `Lesson on ${new Date(booking.start_time).toLocaleDateString('en-AU', { 
                  weekday: 'short', 
                  year: 'numeric', 
                  month: 'short', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}`,
              },
              unit_amount: booking.price_cents,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          setup_future_usage: 'off_session', // Save card for future use
          metadata: {
            booking_id: booking.id,
            client_id: client.id,
            client_email: client.email,
            service_code: booking.service_code || '',
          },
        },
        metadata: {
          booking_id: booking.id,
          client_id: client.id,
          client_email: client.email,
          service_code: booking.service_code || '',
        },
        success_url: `${SITE_URL}/portal.html?payment=success&booking_id=${booking.id}#bookings`,
        cancel_url: `${SITE_URL}/portal.html?payment=cancelled&booking_id=${booking.id}#bookings`,
        client_reference_id: booking.id,
      });
    } catch (stripeError: any) {
      console.error("[create-stripe-checkout-session] Stripe API error:", stripeError);
      
      // Handle idempotency errors (check multiple possible error shapes)
      const isIdempotencyError =
        stripeError?.rawType === 'idempotency_error' ||
        stripeError?.code === 'idempotency_error' ||
        stripeError?.type === 'StripeIdempotencyError' ||
        stripeError?.message?.includes('idempotent requests');

      if (isIdempotencyError) {
        return json({ error: "Payment session conflict. Please try again." }, 400);
      }
      
      return json({ 
        error: "Failed to create payment session. Please try again.", 
        details: stripeError.message 
      }, 500);
    }

    console.log(`[create-stripe-checkout-session] Created session: ${session.id}`);

    // Update booking with checkout session ID and pending status
    const { error: updateBookingError } = await supabase
      .from("booking")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_payment_status: 'pending',
      })
      .eq("id", booking.id);

    if (updateBookingError) {
      console.error("[create-stripe-checkout-session] Failed to update booking:", updateBookingError);
      // Continue anyway - webhook will handle the update
    }

    return json({ sessionUrl: session.url });

  } catch (err) {
    console.error("[create-stripe-checkout-session] Unexpected error:", err);
    return json({ error: "Unexpected error", details: String(err) }, 500);
  }
});
