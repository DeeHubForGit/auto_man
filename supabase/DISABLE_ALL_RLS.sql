-- ============================================================
-- DISABLE ALL RLS - TEMPORARY FIX FOR ADMIN DASHBOARD
-- ============================================================
-- This script completely removes Row Level Security from booking
-- and client tables to get the admin dashboard working.
-- 
-- ⚠️  WARNING: This removes ALL access restrictions!
-- ⚠️  Anyone with database access can read/modify all data.
-- ⚠️  Re-enable RLS with proper policies before going to production.
-- ============================================================

-- ============================================================
-- BOOKING TABLE - REMOVE ALL RLS
-- ============================================================

-- Drop all existing policies on booking table
DROP POLICY IF EXISTS "Users can read own bookings" ON public.booking;
DROP POLICY IF EXISTS "Admin users can read all bookings" ON public.booking;
DROP POLICY IF EXISTS "Service role full access booking" ON public.booking;
DROP POLICY IF EXISTS "Users can read own booking record" ON public.booking;
DROP POLICY IF EXISTS "Users can insert own booking record" ON public.booking;
DROP POLICY IF EXISTS "Users can update own booking record" ON public.booking;
DROP POLICY IF EXISTS "Service role has full access" ON public.booking;

-- Disable RLS completely on booking table
ALTER TABLE public.booking DISABLE ROW LEVEL SECURITY;

-- Grant broad permissions (since RLS is disabled)
GRANT ALL ON TABLE public.booking TO authenticated;
GRANT ALL ON TABLE public.booking TO anon;
GRANT ALL ON TABLE public.booking TO service_role;

-- ============================================================
-- CLIENT TABLE - REMOVE ALL RLS
-- ============================================================

-- Drop all existing policies on client table
DROP POLICY IF EXISTS "Users can read own client record" ON public.client;
DROP POLICY IF EXISTS "Users can insert own client record" ON public.client;
DROP POLICY IF EXISTS "Users can update own client record" ON public.client;
DROP POLICY IF EXISTS "Service role has full access" ON public.client;
DROP POLICY IF EXISTS "Admin users can read all clients" ON public.client;

-- Disable RLS completely on client table
ALTER TABLE public.client DISABLE ROW LEVEL SECURITY;

-- Grant broad permissions (since RLS is disabled)
GRANT ALL ON TABLE public.client TO authenticated;
GRANT ALL ON TABLE public.client TO anon;
GRANT ALL ON TABLE public.client TO service_role;

-- ============================================================
-- CONTACT_MESSAGES TABLE - REMOVE RLS (if enabled)
-- ============================================================

-- Drop any policies that might exist
DROP POLICY IF EXISTS "Anyone can insert contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Admin can read contact messages" ON public.contact_messages;

-- Disable RLS 
ALTER TABLE public.contact_messages DISABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON TABLE public.contact_messages TO authenticated;
GRANT ALL ON TABLE public.contact_messages TO anon;
GRANT ALL ON TABLE public.contact_messages TO service_role;

-- ============================================================
-- CLIENT_PROGRESS TABLE - REMOVE RLS (if enabled)
-- ============================================================

-- Drop any policies that might exist
DROP POLICY IF EXISTS "Users can read own progress" ON public.client_progress;
DROP POLICY IF EXISTS "Users can upsert own progress" ON public.client_progress;
DROP POLICY IF EXISTS "Admin can read all progress" ON public.client_progress;

-- Disable RLS 
ALTER TABLE public.client_progress DISABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON TABLE public.client_progress TO authenticated;
GRANT ALL ON TABLE public.client_progress TO anon;
GRANT ALL ON TABLE public.client_progress TO service_role;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these to verify RLS is disabled:
-- 
-- SELECT schemaname, tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE tablename IN ('booking', 'client', 'contact_messages', 'client_progress');
-- 
-- SELECT * FROM pg_policies WHERE tablename IN ('booking', 'client');
-- 
-- ============================================================
-- TO RE-ENABLE RLS LATER:
-- ============================================================
-- ALTER TABLE public.booking ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.client ENABLE ROW LEVEL SECURITY;
-- -- Then recreate appropriate policies
-- ============================================================