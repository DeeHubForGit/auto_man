-- ===========================================
-- RLS Policies for public.booking
-- ===========================================

-- Enable RLS
ALTER TABLE public.booking ENABLE ROW LEVEL SECURITY;

-- Optional cleanup
DROP POLICY IF EXISTS "Users can read own bookings" ON public.booking;
DROP POLICY IF EXISTS "Service role has full access to bookings" ON public.booking;

-- Allow authenticated users to read their own bookings (by matching email)
CREATE POLICY "Users can read own bookings"
ON public.booking
FOR SELECT
TO authenticated
USING (auth.jwt()->>'email' = email);

-- Allow backend (service role) to manage all bookings
CREATE POLICY "Service role has full access to bookings"
ON public.booking
FOR ALL
TO service_role
USING (true);

-- Permissions
GRANT SELECT ON TABLE public.booking TO authenticated;
GRANT ALL ON TABLE public.booking TO service_role;
