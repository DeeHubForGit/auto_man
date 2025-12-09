-- Migration: Add is_payment_required column to booking table
-- Purpose: Flag whether a booking still requires payment, especially for admin-created bookings that bypass Google/Stripe

-- Ensure the column has default FALSE
ALTER TABLE public.booking
ADD COLUMN IF NOT EXISTS is_payment_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.booking
ALTER COLUMN is_payment_required SET DEFAULT false;

-- Add/update documentation comment
COMMENT ON COLUMN public.booking.is_payment_required IS
'Whether the booking still requires payment. Default false. True only for admin-created bookings where payment is handled outside the system.';
