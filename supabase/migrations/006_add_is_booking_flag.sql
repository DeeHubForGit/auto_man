-- Migration: add is_booking, allow service_code & price_cents to be NULL,
-- and change the price check constraint so NULL is allowed.
BEGIN;

-- 1) Add is_booking flag (safe if it already exists)
ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS is_booking BOOLEAN DEFAULT FALSE;

-- 2) Allow service_code / price_cents to be NULL (were NOT NULL)
ALTER TABLE booking ALTER COLUMN service_code DROP NOT NULL;
ALTER TABLE booking ALTER COLUMN price_cents DROP NOT NULL;

-- 3) Replace booking_price_nonneg constraint so NULL is allowed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_price_nonneg') THEN
    ALTER TABLE booking DROP CONSTRAINT booking_price_nonneg;
  END IF;
END
$$;

ALTER TABLE booking
  ADD CONSTRAINT booking_price_nonneg CHECK (price_cents IS NULL OR price_cents >= 0);

COMMIT;
