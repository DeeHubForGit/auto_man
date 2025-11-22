-- ===========================================
-- COMPREHENSIVE RLS FIX
-- ===========================================
-- This removes conflicting policies and sets up proper RLS
-- Run this AFTER the previous RLS script
-- ===========================================

-- ===========================================
-- Step 1: Remove old conflicting service_role policies
-- ===========================================
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN
        SELECT tablename
        FROM pg_policies
        WHERE schemaname = 'public'
        AND policyname = 'Allow service role full access'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow service role full access" ON public.%I;', t.tablename);
    END LOOP;
END $$;

-- ===========================================
-- Step 2: CLIENT TABLE - Complete policies
-- ===========================================
DROP POLICY IF EXISTS "Users can read own client record" ON public.client;
DROP POLICY IF EXISTS "Users can insert own client record" ON public.client;
DROP POLICY IF EXISTS "Users can update own client record" ON public.client;
DROP POLICY IF EXISTS "Service role has full access" ON public.client;

-- Users can read their own record
CREATE POLICY "Users can read own client record"
ON public.client
FOR SELECT
TO authenticated
USING (auth.jwt()->>'email' = email);

-- Users can insert their own record
CREATE POLICY "Users can insert own client record"
ON public.client
FOR INSERT
TO authenticated
WITH CHECK (auth.jwt()->>'email' = email);

-- Users can update their own record
CREATE POLICY "Users can update own client record"
ON public.client
FOR UPDATE
TO authenticated
USING (auth.jwt()->>'email' = email)
WITH CHECK (auth.jwt()->>'email' = email);

-- Service role has full access
CREATE POLICY "Service role full access client"
ON public.client
FOR ALL
TO service_role
USING (true);

-- ===========================================
-- Step 3: BOOKING TABLE - Complete policies
-- ===========================================
DROP POLICY IF EXISTS "Users can read own bookings" ON public.booking;
DROP POLICY IF EXISTS "Service role has full access to bookings" ON public.booking;
DROP POLICY IF EXISTS "Service role full access booking" ON public.booking;

-- Users can read their own bookings
CREATE POLICY "Users can read own bookings"
ON public.booking
FOR SELECT
TO authenticated
USING (auth.jwt()->>'email' = email);

-- Service role has full access
CREATE POLICY "Service role full access booking"
ON public.booking
FOR ALL
TO service_role
USING (true);

-- ===========================================
-- Step 4: OTHER TABLES - Service role only
-- ===========================================

-- client_credit
DROP POLICY IF EXISTS "Service role full access client_credit" ON public.client_credit;
CREATE POLICY "Service role full access client_credit"
ON public.client_credit FOR ALL TO service_role USING (true);

-- client_progress
DROP POLICY IF EXISTS "Service role full access client_progress" ON public.client_progress;
CREATE POLICY "Service role full access client_progress"
ON public.client_progress FOR ALL TO service_role USING (true);

-- contact_messages
DROP POLICY IF EXISTS "Service role full access contact_messages" ON public.contact_messages;
CREATE POLICY "Service role full access contact_messages"
ON public.contact_messages FOR ALL TO service_role USING (true);

-- email_log
DROP POLICY IF EXISTS "Service role full access email_log" ON public.email_log;
CREATE POLICY "Service role full access email_log"
ON public.email_log FOR ALL TO service_role USING (true);

-- sms_log
DROP POLICY IF EXISTS "Service role full access sms_log" ON public.sms_log;
CREATE POLICY "Service role full access sms_log"
ON public.sms_log FOR ALL TO service_role USING (true);

-- sms_queue
DROP POLICY IF EXISTS "Service role full access sms_queue" ON public.sms_queue;
CREATE POLICY "Service role full access sms_queue"
ON public.sms_queue FOR ALL TO service_role USING (true);

-- gcal_state
DROP POLICY IF EXISTS "Service role full access gcal_state" ON public.gcal_state;
CREATE POLICY "Service role full access gcal_state"
ON public.gcal_state FOR ALL TO service_role USING (true);

-- gcal_webhook_log
DROP POLICY IF EXISTS "Service role full access gcal_webhook_log" ON public.gcal_webhook_log;
CREATE POLICY "Service role full access gcal_webhook_log"
ON public.gcal_webhook_log FOR ALL TO service_role USING (true);

-- gcal_sync_log
DROP POLICY IF EXISTS "Service role full access gcal_sync_log" ON public.gcal_sync_log;
CREATE POLICY "Service role full access gcal_sync_log"
ON public.gcal_sync_log FOR ALL TO service_role USING (true);

-- gcal_sync_event_log
DROP POLICY IF EXISTS "Service role full access gcal_sync_event_log" ON public.gcal_sync_event_log;
CREATE POLICY "Service role full access gcal_sync_event_log"
ON public.gcal_sync_event_log FOR ALL TO service_role USING (true);

-- package (read-only for authenticated users, full for service_role)
DROP POLICY IF EXISTS "Service role full access package" ON public.package;
DROP POLICY IF EXISTS "Users can read packages" ON public.package;
CREATE POLICY "Users can read packages"
ON public.package FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Service role full access package"
ON public.package FOR ALL TO service_role USING (true);

-- service (read-only for authenticated users, full for service_role)
DROP POLICY IF EXISTS "Service role full access service" ON public.service;
DROP POLICY IF EXISTS "Users can read services" ON public.service;
CREATE POLICY "Users can read services"
ON public.service FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Service role full access service"
ON public.service FOR ALL TO service_role USING (true);

-- ===========================================
-- Step 5: Grant permissions
-- ===========================================
GRANT SELECT, INSERT, UPDATE ON TABLE public.client TO authenticated;
GRANT SELECT ON TABLE public.booking TO authenticated;
GRANT SELECT ON TABLE public.package TO authenticated;
GRANT SELECT ON TABLE public.service TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ===========================================
-- VERIFICATION QUERIES (run separately to check)
-- ===========================================
-- SELECT tablename, policyname, roles, cmd 
-- FROM pg_policies 
-- WHERE schemaname = 'public' 
-- ORDER BY tablename, policyname;
