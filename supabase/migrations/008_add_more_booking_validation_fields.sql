-- =====================================================================
-- Migration: Add booking admin + address suggestion fields
-- Description: Add fields for address issue codes, Google suggestion,
--              and admin review flag on bookings.
-- Created: 2025-11-29
-- =====================================================================

ALTER TABLE public.booking
  ADD COLUMN IF NOT EXISTS pickup_location_issue text,
  ADD COLUMN IF NOT EXISTS pickup_location_suggestion text,
  ADD COLUMN IF NOT EXISTS is_admin_checked boolean NOT NULL DEFAULT false;

-- Add comments
COMMENT ON COLUMN public.booking.pickup_location_issue IS
  'Short code describing the validation issue (e.g. not_found, street_number, suburb_mismatch).';

COMMENT ON COLUMN public.booking.pickup_location_suggestion IS
  'Best-guess validated address string from Google Maps API, if available.';

COMMENT ON COLUMN public.booking.is_admin_checked IS
  'TRUE when admin has reviewed this booking manually. Automatically reset to FALSE after auto-validation.';

-- =====================================================================
-- END OF MIGRATION
-- =====================================================================
