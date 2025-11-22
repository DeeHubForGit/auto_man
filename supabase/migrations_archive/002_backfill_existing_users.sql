-- Backfill existing auth users into client table
-- Run this AFTER applying 001_auth_user_to_client.sql

-- Insert all existing auth users into the client table
INSERT INTO public.client (id, email, created_at, updated_at)
SELECT 
  id,
  email,
  created_at,
  NOW() as updated_at
FROM auth.users
WHERE email IS NOT NULL
  AND email_confirmed_at IS NOT NULL  -- Only confirmed users
ON CONFLICT (email) DO UPDATE
  SET updated_at = NOW();

-- Show results
SELECT 
  COUNT(*) as total_clients,
  COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 minute' THEN 1 END) as just_created
FROM public.client;
