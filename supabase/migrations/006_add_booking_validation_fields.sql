-- =====================================================================
-- Migration: Add booking validation fields
-- Description: Add fields to track mobile and pickup location validation
-- Created: 2025-11-27
-- =====================================================================

-- Add validation fields to booking table
ALTER TABLE public.booking 
  ADD COLUMN IF NOT EXISTS is_mobile_valid boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_pickup_location_valid boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS validation_checked_at timestamp with time zone DEFAULT NULL;

-- Add comments
COMMENT ON COLUMN public.booking.is_mobile_valid IS 'NULL=not checked, TRUE=valid Australian mobile, FALSE=invalid format';
COMMENT ON COLUMN public.booking.is_pickup_location_valid IS 'NULL=not checked, TRUE=valid address, FALSE=invalid/missing';
COMMENT ON COLUMN public.booking.validation_checked_at IS 'Timestamp when validation was last performed';

-- Create index for finding bookings that need validation
CREATE INDEX IF NOT EXISTS idx_booking_validation_pending 
  ON public.booking (validation_checked_at) 
  WHERE (validation_checked_at IS NULL OR is_mobile_valid IS NULL OR is_pickup_location_valid IS NULL);

-- =====================================================================
-- END OF MIGRATION
-- =====================================================================
