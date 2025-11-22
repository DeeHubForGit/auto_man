-- Migration: Remove refund_eligible trigger and function
-- This is causing gcal-sync errors, reverting to manual calculation in the UI

-- Step 1: Drop the trigger
DROP TRIGGER IF EXISTS trigger_update_refund_eligible ON booking;

-- Step 2: Drop the trigger function
DROP FUNCTION IF EXISTS update_refund_eligible();

-- Step 3: Drop the calculation function (all versions)
DROP FUNCTION IF EXISTS calculate_refund_eligible(TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS calculate_refund_eligible(TIMESTAMPTZ, TIMESTAMPTZ, booking_status);

-- Note: Keep the refund_eligible column for manual updates from the admin UI
COMMENT ON COLUMN booking.refund_eligible IS 
'Manually calculated in admin UI: TRUE if cancelled 24+ hours before start_time, FALSE if <24h, NULL if not cancelled';
