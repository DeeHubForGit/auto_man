-- Add foreign key constraint from booking.service_code to service.code
-- This enables proper Supabase joins and enforces data integrity

-- First, ensure all existing booking.service_code values reference valid services
-- (This will fail if there are orphaned records - you'd need to clean them up first)

ALTER TABLE booking
  ADD CONSTRAINT booking_service_code_fkey 
  FOREIGN KEY (service_code) 
  REFERENCES service(code)
  ON DELETE RESTRICT;  -- Prevent deleting services that have bookings

-- Note: RESTRICT prevents accidental deletion of services with bookings
-- Change to CASCADE if you want bookings deleted when service is deleted
-- Change to SET NULL if you want service_code nulled when service is deleted
