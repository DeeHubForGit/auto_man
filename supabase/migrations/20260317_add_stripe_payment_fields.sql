-- =====================================================================
-- STRIPE PAYMENT INTEGRATION FIELDS
-- =====================================================================
-- Migration: 20260317_add_stripe_payment_fields
-- Description: Add Stripe reference fields for payment processing and 
--              saved payment methods. Enables portal payment flow with
--              Stripe Checkout and customer portal integration.
-- =====================================================================

-- Add Stripe fields to client table
-- These track the Stripe customer and their default payment method
ALTER TABLE public.client
ADD COLUMN IF NOT EXISTS stripe_customer_id text,
ADD COLUMN IF NOT EXISTS stripe_default_payment_method_id text;

COMMENT ON COLUMN public.client.stripe_customer_id IS 'Stripe customer ID for this client. Used to retrieve saved payment methods and create checkout sessions.';
COMMENT ON COLUMN public.client.stripe_default_payment_method_id IS 'Stripe payment method ID for the client''s saved card. Used for future authorized payments.';

-- Add Stripe fields to booking table
-- These track payment session, intent, status, and safe card summary
ALTER TABLE public.booking
ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
ADD COLUMN IF NOT EXISTS stripe_payment_status text,
ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS payment_method_summary text;

COMMENT ON COLUMN public.booking.stripe_checkout_session_id IS 'Stripe Checkout Session ID created for this booking payment. Used to track payment flow and prevent duplicates.';
COMMENT ON COLUMN public.booking.stripe_payment_intent_id IS 'Stripe Payment Intent ID created during checkout. Used for refunds and payment tracking.';
COMMENT ON COLUMN public.booking.stripe_payment_status IS 'Payment status from Stripe: pending, paid, cancelled, failed. Updated by webhook.';
COMMENT ON COLUMN public.booking.paid_at IS 'Timestamp when payment was completed. Set by webhook on successful payment.';
COMMENT ON COLUMN public.booking.payment_method_summary IS 'Safe card summary from Stripe (e.g. "Visa ending 6913 exp 03/2029"). Never stores full card details.';

-- Create indexes for efficient Stripe lookups
CREATE INDEX IF NOT EXISTS idx_client_stripe_customer_id 
ON public.client(stripe_customer_id) 
WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_booking_stripe_checkout_session_id 
ON public.booking(stripe_checkout_session_id) 
WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_booking_stripe_payment_intent_id 
ON public.booking(stripe_payment_intent_id) 
WHERE stripe_payment_intent_id IS NOT NULL;

-- Create index for unpaid confirmed bookings (portal query optimization)
-- Optimizes queries for bookings that are unpaid, confirmed, and not test bookings
CREATE INDEX IF NOT EXISTS idx_booking_unpaid_confirmed 
ON public.booking(client_id, is_paid, status, is_test) 
WHERE is_paid = false AND status = 'confirmed' AND is_test = false;

COMMENT ON INDEX public.idx_client_stripe_customer_id IS 'Speeds up lookups by Stripe customer ID for payment method retrieval.';
COMMENT ON INDEX public.idx_booking_stripe_checkout_session_id IS 'Speeds up webhook lookups by checkout session ID.';
COMMENT ON INDEX public.idx_booking_stripe_payment_intent_id IS 'Speeds up webhook lookups by payment intent ID.';
COMMENT ON INDEX public.idx_booking_unpaid_confirmed IS 'Optimizes portal queries for unpaid confirmed bookings (excludes test bookings).';
