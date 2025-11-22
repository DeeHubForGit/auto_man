-- Add refund tracking and cancellation audit fields to booking table
-- Allows admin to mark cancellations as refunded and track when refunds were processed
-- Also tracks who cancelled the booking for audit trail

ALTER TABLE booking
  ADD COLUMN refunded BOOLEAN DEFAULT FALSE,
  ADD COLUMN refunded_at TIMESTAMPTZ,
  ADD COLUMN cancelled_by TEXT;

-- Create index for filtering refunded bookings
CREATE INDEX idx_booking_refunded ON booking(refunded) WHERE refunded = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN booking.refunded IS 'Whether a refund has been processed for this cancelled booking';
COMMENT ON COLUMN booking.refunded_at IS 'Timestamp when the refund was marked as processed';
COMMENT ON COLUMN booking.cancelled_by IS 'Email of person who cancelled (client email, admin email, or NULL for unknown/Google sync)';
