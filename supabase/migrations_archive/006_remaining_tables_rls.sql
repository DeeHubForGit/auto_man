-- ============================================================
-- AUTO-MAN PROJECT: COMPLETE & SAFE RLS POLICY SETUP
-- ============================================================
-- This script handles all remaining tables that need RLS policies.
-- Assumes client and booking tables already have correct policies.
-- ============================================================


-- ============================================================
-- STEP 1: GLOBAL CLEANUP OF OLD POLICIES (Optional safety)
-- ============================================================
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


-- ============================================================
-- STEP 2: CLIENT_CREDIT TABLE
-- ============================================================

ALTER TABLE public.client_credit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own credits" ON public.client_credit;
DROP POLICY IF EXISTS "Service role full access client_credit" ON public.client_credit;

-- Users can see their own credits
CREATE POLICY "Users can read own credits" ON public.client_credit
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT id FROM public.client WHERE email = auth.jwt()->>'email'
    )
  );

-- Service role can do everything
CREATE POLICY "Service role full access client_credit" ON public.client_credit
  FOR ALL
  TO service_role
  USING (true);

GRANT SELECT ON TABLE public.client_credit TO authenticated;
GRANT ALL ON TABLE public.client_credit TO service_role;


-- ============================================================
-- STEP 3: CLIENT_PROGRESS TABLE
-- ============================================================

ALTER TABLE public.client_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own progress" ON public.client_progress;
DROP POLICY IF EXISTS "Service role full access client_progress" ON public.client_progress;

-- Users can see their own progress (matched by email)
CREATE POLICY "Users can read own progress" ON public.client_progress
  FOR SELECT
  TO authenticated
  USING (auth.jwt()->>'email' = email);

-- Service role can do everything
CREATE POLICY "Service role full access client_progress" ON public.client_progress
  FOR ALL
  TO service_role
  USING (true);

GRANT SELECT ON TABLE public.client_progress TO authenticated;
GRANT ALL ON TABLE public.client_progress TO service_role;


-- ============================================================
-- STEP 4: CONTACT_MESSAGES TABLE
-- ============================================================

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Anon can insert messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Service role full access contact_messages" ON public.contact_messages;

-- Users can read their own messages
CREATE POLICY "Users can read own messages" ON public.contact_messages
  FOR SELECT
  TO authenticated
  USING (auth.jwt()->>'email' = email);

-- Allow anonymous users to submit contact forms
CREATE POLICY "Anon can insert messages" ON public.contact_messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Service role can do everything
CREATE POLICY "Service role full access contact_messages" ON public.contact_messages
  FOR ALL
  TO service_role
  USING (true);

GRANT SELECT, INSERT ON TABLE public.contact_messages TO anon, authenticated;
GRANT ALL ON TABLE public.contact_messages TO service_role;


-- ============================================================
-- STEP 5: EMAIL_LOG TABLE (system-managed)
-- ============================================================

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access email_log" ON public.email_log;

CREATE POLICY "Service role full access email_log" ON public.email_log
  FOR ALL
  TO service_role
  USING (true);

GRANT ALL ON TABLE public.email_log TO service_role;


-- ============================================================
-- STEP 6: SMS_LOG TABLE (system-managed)
-- ============================================================

ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access sms_log" ON public.sms_log;

CREATE POLICY "Service role full access sms_log" ON public.sms_log
  FOR ALL
  TO service_role
  USING (true);

GRANT ALL ON TABLE public.sms_log TO service_role;


-- ============================================================
-- STEP 7: SMS_QUEUE TABLE (system-managed)
-- ============================================================

ALTER TABLE public.sms_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access sms_queue" ON public.sms_queue;

CREATE POLICY "Service role full access sms_queue" ON public.sms_queue
  FOR ALL
  TO service_role
  USING (true);

GRANT ALL ON TABLE public.sms_queue TO service_role;


-- ============================================================
-- STEP 8: GCAL_STATE TABLE (system-managed)
-- ============================================================

ALTER TABLE public.gcal_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access gcal_state" ON public.gcal_state;

CREATE POLICY "Service role full access gcal_state" ON public.gcal_state
  FOR ALL
  TO service_role
  USING (true);

GRANT ALL ON TABLE public.gcal_state TO service_role;


-- ============================================================
-- STEP 9: GCAL_WEBHOOK_LOG TABLE (system-managed)
-- ============================================================

ALTER TABLE public.gcal_webhook_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access gcal_webhook_log" ON public.gcal_webhook_log;

CREATE POLICY "Service role full access gcal_webhook_log" ON public.gcal_webhook_log
  FOR ALL
  TO service_role
  USING (true);

GRANT ALL ON TABLE public.gcal_webhook_log TO service_role;


-- ============================================================
-- STEP 10: GCAL_SYNC_LOG TABLE (system-managed)
-- ============================================================

ALTER TABLE public.gcal_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access gcal_sync_log" ON public.gcal_sync_log;

CREATE POLICY "Service role full access gcal_sync_log" ON public.gcal_sync_log
  FOR ALL
  TO service_role
  USING (true);

GRANT ALL ON TABLE public.gcal_sync_log TO service_role;


-- ============================================================
-- STEP 11: GCAL_SYNC_EVENT_LOG TABLE (system-managed)
-- ============================================================

ALTER TABLE public.gcal_sync_event_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access gcal_sync_event_log" ON public.gcal_sync_event_log;

CREATE POLICY "Service role full access gcal_sync_event_log" ON public.gcal_sync_event_log
  FOR ALL
  TO service_role
  USING (true);

GRANT ALL ON TABLE public.gcal_sync_event_log TO service_role;


-- ============================================================
-- STEP 12: PACKAGE TABLE (read-only for users)
-- ============================================================

ALTER TABLE public.package ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read active packages" ON public.package;
DROP POLICY IF EXISTS "Service role full access package" ON public.package;

-- Users can read active packages
CREATE POLICY "Users can read active packages" ON public.package
  FOR SELECT
  TO authenticated, anon
  USING (is_active = true);

-- Service role can do everything
CREATE POLICY "Service role full access package" ON public.package
  FOR ALL
  TO service_role
  USING (true);

GRANT SELECT ON TABLE public.package TO anon, authenticated;
GRANT ALL ON TABLE public.package TO service_role;


-- ============================================================
-- STEP 13: SERVICE TABLE (read-only for users)
-- ============================================================

ALTER TABLE public.service ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read active services" ON public.service;
DROP POLICY IF EXISTS "Service role full access service" ON public.service;

-- Users can read active services
CREATE POLICY "Users can read active services" ON public.service
  FOR SELECT
  TO authenticated, anon
  USING (is_active = true);

-- Service role can do everything
CREATE POLICY "Service role full access service" ON public.service
  FOR ALL
  TO service_role
  USING (true);

GRANT SELECT ON TABLE public.service TO anon, authenticated;
GRANT ALL ON TABLE public.service TO service_role;


-- ============================================================
-- STEP 14: FINAL VERIFICATION
-- ============================================================
-- Run to confirm all policies are correctly applied:
-- 
-- SELECT schemaname, tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
-- ============================================================
