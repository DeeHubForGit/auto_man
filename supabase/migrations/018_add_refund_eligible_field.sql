-- Migration: Add refund_eligible field to booking table
-- This field automatically tracks whether a cancellation is eligible for refund
-- based on the 24-hour notice policy

-- Step 1: Add the refund_eligible column
ALTER TABLE booking 
ADD COLUMN IF NOT EXISTS refund_eligible BOOLEAN DEFAULT NULL;

-- Step 2: Create a function to calculate refund eligibility
CREATE OR REPLACE FUNCTION calculate_refund_eligible(
  p_start_time TIMESTAMPTZ,
  p_cancelled_at TIMESTAMPTZ,
  p_status TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  -- Only cancelled bookings can be refund eligible
  IF p_status != 'cancelled' OR p_cancelled_at IS NULL OR p_start_time IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Calculate hours of notice given
  -- If cancelled 24+ hours before the booking, eligible for refund
  RETURN (EXTRACT(EPOCH FROM (p_start_time - p_cancelled_at)) / 3600) >= 24;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 3: Create trigger function to auto-calculate refund_eligible
CREATE OR REPLACE FUNCTION update_refund_eligible()
RETURNS TRIGGER AS $$
BEGIN
  NEW.refund_eligible := calculate_refund_eligible(
    NEW.start_time,
    NEW.cancelled_at,
    NEW.status
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create trigger to run on INSERT and UPDATE
DROP TRIGGER IF EXISTS trigger_update_refund_eligible ON booking;
CREATE TRIGGER trigger_update_refund_eligible
  BEFORE INSERT OR UPDATE OF start_time, cancelled_at, status
  ON booking
  FOR EACH ROW
  EXECUTE FUNCTION update_refund_eligible();

-- Step 5: Backfill existing cancelled bookings
UPDATE booking
SET refund_eligible = calculate_refund_eligible(start_time::TIMESTAMPTZ, cancelled_at::TIMESTAMPTZ, status::TEXT)
WHERE status = 'cancelled';

-- Step 6: Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_booking_refund_eligible 
ON booking(refund_eligible) 
WHERE status = 'cancelled';

-- Add comment for documentation
COMMENT ON COLUMN booking.refund_eligible IS 
'Automatically calculated: TRUE if cancelled 24+ hours before start_time, FALSE if <24h, NULL if not cancelled';
