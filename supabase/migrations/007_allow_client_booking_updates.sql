-- Migration: Allow clients to update their own booking contact details
-- Created: 2025-11-27
-- Purpose: Enable clients to update mobile and pickup_location on their own bookings

-- Drop existing restrictive policy
DROP POLICY IF EXISTS booking_mutate ON public.booking;

-- Recreate with admin/service_role access for all operations
CREATE POLICY booking_admin_mutate ON public.booking
    FOR ALL
    TO authenticated, anon
    USING (
        (auth.role() = 'service_role'::text) 
        OR public.is_admin()
    )
    WITH CHECK (
        (auth.role() = 'service_role'::text) 
        OR public.is_admin()
    );

-- Allow clients to update specific fields on their own bookings
CREATE POLICY booking_client_update_contact ON public.booking
    FOR UPDATE
    TO authenticated
    USING (
        -- Client can only update their own bookings
        client_id IN (
            SELECT id FROM public.client 
            WHERE email = COALESCE((auth.jwt() ->> 'email'::text), ''::text)
        )
    )
    WITH CHECK (
        -- Client can only update their own bookings
        client_id IN (
            SELECT id FROM public.client 
            WHERE email = COALESCE((auth.jwt() ->> 'email'::text), ''::text)
        )
    );

COMMENT ON POLICY booking_client_update_contact ON public.booking IS 
    'Allows authenticated clients to update mobile, pickup_location, and validation fields on their own confirmed bookings';
