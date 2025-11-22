-- Add contact_messages and client_progress tables
-- Run this in Supabase SQL Editor

-- Contact form messages table
CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at DESC);

-- Client progress tracking (driving skills checklist)
CREATE TABLE IF NOT EXISTS client_progress (
  email TEXT PRIMARY KEY,
  skills JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_client_progress_updated() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_client_progress_updated ON client_progress;
CREATE TRIGGER t_client_progress_updated BEFORE UPDATE ON client_progress
FOR EACH ROW EXECUTE FUNCTION set_client_progress_updated();

-- Grant permissions for authenticated users
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON TABLE public.client TO anon, authenticated;
GRANT SELECT ON TABLE public.contact_messages TO authenticated;
GRANT INSERT ON TABLE public.contact_messages TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.client_progress TO authenticated;

-- Optional: Enable RLS and create policies
-- Uncomment if you want row-level security

-- ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Admins can read contact messages" ON contact_messages
--   FOR SELECT USING (auth.email() IN ('darren@automandrivingschool.com.au'));

-- ALTER TABLE client_progress ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Admins can manage client progress" ON client_progress
--   FOR ALL USING (auth.email() IN ('darren@automandrivingschool.com.au'));
