-- Migration: Stop syncing is_paid in Google upsert.
DONE BELOW
-- 1) Add flag to indicate bookings created by admin.
--ALTER TABLE public.booking
--  ADD COLUMN IF NOT EXISTS is_admin_booking boolean DEFAULT false;

-- 2) Update upsert function: Google-synced bookings are scheduled bookings
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
    p_title text
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
  v_client_id    uuid := null;  -- Initialize client_id
  v_booking_id   uuid;
  v_was_inserted boolean;
  v_sms_sent_at  timestamptz;
  v_email_sent_at timestamptz;
BEGIN
  -- Upsert client (only IF email is provided)
  IF p_client_email is NOT null THEN
    INSERT INTO public.client (email, first_name, last_name, mobile)
    VALUES (p_client_email, p_first_name, p_last_name, p_mobile)
    ON CONFLICT (email) DO UPDATE
      SET first_name = COALESCE(public.client.first_name, EXCLUDED.first_name),
          last_name  = COALESCE(public.client.last_name, EXCLUDED.last_name),
          mobile     = COALESCE(public.client.mobile, EXCLUDED.mobile),
          updated_at = now()
    RETURNING id INTO v_client_id;
  end IF;

  -- Upsert booking (no is_paid field)
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

COMMENT ON FUNCTION public.upsert_booking_from_google IS 'Upserts booking from Google Calendar event.';

