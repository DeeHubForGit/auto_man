-- ============================================================
-- RLS POLICIES ADMIN FIX - Run this in Supabase SQL Editor
-- ============================================================
-- This adds admin-specific policies to allow admin users to see
-- all bookings in the admin calendar, while keeping regular users
-- restricted to their own bookings.
-- ============================================================

-- ============================================================
-- BOOKING TABLE ADMIN POLICIES
-- ============================================================

-- Drop existing booking policies to recreate them with admin access
DROP POLICY IF EXISTS "Users can read own bookings" ON public.booking;
DROP POLICY IF EXISTS "Admin users can read all bookings" ON public.booking;
DROP POLICY IF EXISTS "Service role full access booking" ON public.booking;

-- Policy: Regular users can read their own bookings (by email match)
CREATE POLICY "Users can read own bookings" ON public.booking
  FOR SELECT
  TO authenticated
  USING (auth.jwt()->>'email' = email);

-- Policy: Admin users can read ALL bookings
CREATE POLICY "Admin users can read all bookings" ON public.booking
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt()->>'email' IN (
      'darren@automandrivingschool.com.au'
      -- Add more admin emails here as needed, comma-separated
    )
  );

-- Policy: Service role can do everything (for backend operations like gcal-sync)
CREATE POLICY "Service role full access booking" ON public.booking
  FOR ALL
  TO service_role
  USING (true);

-- Grant necessary permissions
GRANT SELECT ON TABLE public.booking TO authenticated;
GRANT ALL ON TABLE public.booking TO service_role;

-- ============================================================
-- CLIENT TABLE ADMIN POLICIES (Optional - for admin client management)
-- ============================================================

-- Drop existing client admin policy if it exists
DROP POLICY IF EXISTS "Admin users can read all clients" ON public.client;

-- Policy: Admin users can read ALL client records
CREATE POLICY "Admin users can read all clients" ON public.client
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt()->>'email' IN (
      'darren@automandrivingschool.com.au'
      -- Add more admin emails here as needed, comma-separated
    )
  );

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Run these queries to verify policies are in place:
-- 
-- SELECT * FROM pg_policies WHERE tablename = 'booking';
-- SELECT * FROM pg_policies WHERE tablename = 'client';
-- 
-- Test the admin access by running a booking query as an admin user:
-- SELECT count(*) FROM booking; -- Should return all bookings for admin
-- ============================================================