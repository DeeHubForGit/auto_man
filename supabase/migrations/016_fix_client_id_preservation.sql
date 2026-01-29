-- Migration: Fix client_id preservation in booking upsert
-- Problem: When Google Calendar events update, bookings lose their client_id
-- Solution: 
--   1) Preserve existing client_id when updating bookings (COALESCE existing first)
--   2) Add optional p_client_id parameter to allow direct client_id passing
--   3) Only upsert client via email if client_id not provided

-- Drop old function signature explicitly to avoid function overload
DROP FUNCTION IF EXISTS public.upsert_booking_from_google(
  text, text, text, text, text, text, text, integer, timestamptz, timestamptz,
  text, jsonb, boolean, text
);

-- Create function with new parameter
CREATE OR REPLACE FUNCTION public.upsert_booking_from_google(
    p_google_event_id text,
    p_calendar_id text,
    p_client_email text,
    p_first_name text,
    p_last_name text,
    p_mobile text,
    p_service_code text,
    p_price_cents integer,
    p_start timestamptz,
    p_end timestamptz,
    p_pickup text,
    p_extended jsonb,
    p_is_booking boolean,
    p_title text,
    p_client_id uuid DEFAULT NULL  -- NEW: optional client_id
)
RETURNS TABLE(
  booking_id uuid,
  was_inserted boolean,
  sms_sent_at timestamp with time zone,
  email_confirm_sent_at timestamp with time zone
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_client_id    uuid := p_client_id;  -- Start with passed-in client_id (may be null)
  v_booking_id   uuid;
  v_was_inserted boolean;
  v_sms_sent_at  timestamptz;
  v_email_sent_at timestamptz;
BEGIN
  -- Upsert client ONLY if client_id not provided AND email is available
  IF v_client_id IS NULL AND NULLIF(trim(p_client_email), '') IS NOT NULL THEN
    INSERT INTO public.client (email, first_name, last_name, mobile)
    VALUES (p_client_email, p_first_name, p_last_name, p_mobile)
    ON CONFLICT (email) DO UPDATE
      SET first_name = COALESCE(public.client.first_name, EXCLUDED.first_name),
          last_name  = COALESCE(public.client.last_name, EXCLUDED.last_name),
          mobile     = COALESCE(public.client.mobile, EXCLUDED.mobile),
          updated_at = now()
    RETURNING id INTO v_client_id;
  END IF;

  -- Upsert booking
  INSERT INTO public.booking (
    client_id,
    google_event_id,
    google_calendar_id,
    source,
    is_booking,
    service_code,
    price_cents,
    start_time,
    end_time,
    pickup_location,
    extended,
    event_title,
    first_name,
    last_name,
    email,
    mobile
  )
  VALUES (
    v_client_id,
    p_google_event_id,
    p_calendar_id,
    'google',
    COALESCE(p_is_booking, true),
    p_service_code,
    p_price_cents,
    p_start,
    p_end,
    p_pickup,
    COALESCE(p_extended, '{}'::jsonb),
    p_title,
    p_first_name,
    p_last_name,
    p_client_email,
    p_mobile
  )
  ON CONFLICT (google_event_id) DO UPDATE
  SET
    -- CRITICAL: Preserve existing client_id if present, only fill if missing
    client_id          = COALESCE(public.booking.client_id, EXCLUDED.client_id),
    
    google_calendar_id = EXCLUDED.google_calendar_id,
    start_time         = EXCLUDED.start_time,
    end_time           = EXCLUDED.end_time,

    -- Only fill pickup if we don't already have one
    pickup_location    = COALESCE(public.booking.pickup_location, EXCLUDED.pickup_location),

    -- Keep latest Google payload for audit/debug
    extended           = COALESCE(EXCLUDED.extended, '{}'::jsonb),

    -- Title can change in Google
    event_title        = COALESCE(EXCLUDED.event_title, public.booking.event_title),

    updated_at         = now()
  RETURNING
  public.booking.id,
  public.booking.sms_confirm_sent_at,
  public.booking.email_confirm_sent_at,
  (xmax = 0)
  INTO
  v_booking_id,
  v_sms_sent_at,
  v_email_sent_at,
  v_was_inserted;

  -- RETURN the result with all required fields
  RETURN query
    SELECT v_booking_id, v_was_inserted, v_sms_sent_at, v_email_sent_at;
END;
$$;
