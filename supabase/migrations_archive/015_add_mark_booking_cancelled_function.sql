-- Add function to handle booking cancellations from Google Calendar
-- Sets status='cancelled' and records the cancellation timestamp
-- Updated to accept optional cancellation timestamp from Google Calendar

-- Drop existing function first (handles both old and new signatures)
DROP FUNCTION IF EXISTS mark_booking_cancelled(TEXT);
DROP FUNCTION IF EXISTS mark_booking_cancelled(TEXT, TIMESTAMPTZ);

-- Create new version with optional timestamp parameter
CREATE FUNCTION mark_booking_cancelled(
  p_google_event_id TEXT,
  p_cancelled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE booking
  SET 
    status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, p_cancelled_at, NOW()),  -- Use provided timestamp, fallback to NOW()
    updated_at = NOW()
  WHERE google_event_id = p_google_event_id
    AND status != 'cancelled';  -- Only update if not already cancelled
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION mark_booking_cancelled TO authenticated, anon, service_role;
