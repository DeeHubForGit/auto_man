-- ===========================================
-- RLS Policies for public.client
-- ===========================================

-- Enable RLS (safe to run repeatedly)
ALTER TABLE public.client ENABLE ROW LEVEL SECURITY;

-- Optional: drop any previous conflicting policies
DROP POLICY IF EXISTS "Users can read own client record" ON public.client;
DROP POLICY IF EXISTS "Users can insert own client record" ON public.client;
DROP POLICY IF EXISTS "Users can update own client record" ON public.client;
DROP POLICY IF EXISTS "Service role has full access" ON public.client;

-- Allow authenticated users to read their own client record
CREATE POLICY "Users can read own client record"
ON public.client
FOR SELECT
USING (auth.jwt()->>'email' = email);

-- Allow authenticated users to insert their own client record
CREATE POLICY "Users can insert own client record"
ON public.client
FOR INSERT
WITH CHECK (auth.jwt()->>'email' = email);

-- Allow authenticated users to update their own client record
CREATE POLICY "Users can update own client record"
ON public.client
FOR UPDATE
USING (auth.jwt()->>'email' = email)
WITH CHECK (auth.jwt()->>'email' = email);

-- Allow backend service role full unrestricted access
CREATE POLICY "Service role has full access"
ON public.client
FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- Permissions
GRANT SELECT, INSERT, UPDATE ON TABLE public.client TO authenticated;
GRANT ALL ON TABLE public.client TO service_role;
