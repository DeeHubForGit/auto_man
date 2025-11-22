-- Migration: Add refund_eligible calculation function with trigger
-- Using explicit public schema prefix and STRICT modifier

-- Step 1: Create the function to calculate refund eligibility
CREATE OR REPLACE FUNCTION public.calculate_refund_eligible(
  p_start_time TIMESTAMPTZ,
  p_cancelled_at TIMESTAMPTZ,
  p_status public.booking_status
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
BEGIN
  -- Only cancelled bookings can be refund eligible
  IF p_status != 'cancelled' OR p_cancelled_at IS NULL OR p_start_time IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Cancelled 24+ hours before start_time = eligible
  RETURN (EXTRACT(EPOCH FROM (p_start_time - p_cancelled_at)) / 3600) >= 24;
END;
$$;

-- Step 2: Create trigger function to auto-calculate refund_eligible
CREATE OR REPLACE FUNCTION public.update_refund_eligible()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.refund_eligible := public.calculate_refund_eligible(
    NEW.start_time,
    NEW.cancelled_at,
    NEW.status
  );
  RETURN NEW;
END;
$$;

-- Step 3: Create trigger to run on INSERT and UPDATE
DROP TRIGGER IF EXISTS trigger_update_refund_eligible ON booking;
CREATE TRIGGER trigger_update_refund_eligible
  BEFORE INSERT OR UPDATE OF start_time, cancelled_at, status
  ON booking
  FOR EACH ROW
  EXECUTE FUNCTION public.update_refund_eligible();

-- Step 4: Backfill existing cancelled bookings
UPDATE booking
SET refund_eligible = public.calculate_refund_eligible(start_time, cancelled_at, status)
WHERE status = 'cancelled';

-- Update comment for documentation
COMMENT ON COLUMN booking.refund_eligible IS 
'Automatically calculated: TRUE if cancelled 24+ hours before start_time, FALSE if <24h, NULL if not cancelled';
