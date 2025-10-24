-- ============================================================
-- COMPLETE RLS REMOVAL SCRIPT
-- ============================================================
-- This script will completely remove ALL Row Level Security
-- from booking and client tables to get the admin dashboard working
-- ============================================================

-- Step 1: Drop ALL existing policies on booking table
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'booking' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.booking', policy_record.policyname);
        RAISE NOTICE 'Dropped policy: %', policy_record.policyname;
    END LOOP;
END $$;

-- Step 2: Drop ALL existing policies on client table
DO $$ 
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'client' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.client', policy_record.policyname);
        RAISE NOTICE 'Dropped policy: %', policy_record.policyname;
    END LOOP;
END $$;

-- Step 3: Completely disable RLS on both tables
ALTER TABLE public.booking DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.client DISABLE ROW LEVEL SECURITY;

-- Step 4: Grant full permissions to all roles
GRANT ALL ON TABLE public.booking TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.client TO authenticated, anon, service_role;

-- Step 5: Also disable RLS on related tables that might have policies
ALTER TABLE public.contact_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log DISABLE ROW LEVEL SECURITY;

-- Grant permissions on related tables
GRANT ALL ON TABLE public.contact_messages TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.client_progress TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.sms_log TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.email_log TO authenticated, anon, service_role;

-- Step 6: Verification - Check that no policies remain
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename IN ('booking', 'client', 'contact_messages', 'client_progress', 'sms_log', 'email_log')
AND schemaname = 'public';

-- Step 7: Check RLS status
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename IN ('booking', 'client', 'contact_messages', 'client_progress', 'sms_log', 'email_log')
AND schemaname = 'public';

-- ============================================================
-- EXPECTED RESULTS:
-- - First query should return NO rows (no policies)
-- - Second query should show rowsecurity = false for all tables
-- ============================================================

RAISE NOTICE 'RLS has been completely disabled on all admin dashboard tables';
RAISE NOTICE 'Your admin dashboard should now show all data without restrictions';
RAISE NOTICE 'Remember to re-enable RLS with proper admin policies before production!';