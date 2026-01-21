-- Migration: Add is_paid column and keep it in sync with legacy is_payment_required
--
-- Goal:
--   is_paid = true  -> paid
--   is_paid = false -> unpaid
--
-- During the transition we keep legacy is_payment_required and sync both directions.

ALTER TABLE public.booking
ADD COLUMN IF NOT EXISTS is_paid boolean;

-- Backfill is_paid from legacy column for existing rows
UPDATE public.booking
SET is_paid = NOT is_payment_required
WHERE is_paid IS NULL;

-- Default to unpaid
ALTER TABLE public.booking
ALTER COLUMN is_paid SET DEFAULT false;

-- Ensure no NULLs remain
UPDATE public.booking
SET is_paid = false
WHERE is_paid IS NULL;

-- Keep both columns in sync temporarily
CREATE OR REPLACE FUNCTION public.sync_paid_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- OLD is not available on INSERT.
  IF TG_OP = 'INSERT' THEN
    -- Prefer is_paid if both are provided.
    IF NEW.is_paid IS NOT NULL THEN
      NEW.is_payment_required := NOT COALESCE(NEW.is_paid, false);
      RETURN NEW;
    END IF;

    IF NEW.is_payment_required IS NOT NULL THEN
      NEW.is_paid := NOT COALESCE(NEW.is_payment_required, true);
      RETURN NEW;
    END IF;

    -- Neither provided; enforce consistent defaults.
    NEW.is_paid := COALESCE(NEW.is_paid, false);
    NEW.is_payment_required := NOT COALESCE(NEW.is_paid, false);
    RETURN NEW;
  END IF;

  -- UPDATE
  -- If is_paid is explicitly changed, derive is_payment_required
  IF NEW.is_paid IS DISTINCT FROM OLD.is_paid THEN
    NEW.is_payment_required := NOT COALESCE(NEW.is_paid, false);
    RETURN NEW;
  END IF;

  -- If is_payment_required is explicitly changed, derive is_paid
  IF NEW.is_payment_required IS DISTINCT FROM OLD.is_payment_required THEN
    NEW.is_paid := NOT COALESCE(NEW.is_payment_required, true);
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_paid_flags ON public.booking;

CREATE TRIGGER trg_sync_paid_flags
BEFORE INSERT OR UPDATE OF is_paid, is_payment_required ON public.booking
FOR EACH ROW
EXECUTE FUNCTION public.sync_paid_flags();
