-- Migration: Update upsert_booking_from_google function to use is_paid
-- During transition, trigger trg_sync_paid_flags keeps legacy is_payment_required synced.

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
  p_is_paid boolean DEFAULT false
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
  v_client_id    uuid;
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
          last_name  = COALESCE(public.client.last_name,  EXCLUDED.last_name),
          mobile     = COALESCE(public.client.mobile,   EXCLUDED.mobile),
          updated_at = now()
    RETURNING id INTO v_client_id;
  end IF;

  -- Upsert booking (with is_paid)
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
    mobile,
    is_paid
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
    p_mobile,
    COALESCE(p_is_paid, false)
  )
  ON CONFLICT (google_event_id) DO UPDATE
    SET client_id          = COALESCE(EXCLUDED.client_id, public.booking.client_id),
        google_calendar_id = EXCLUDED.google_calendar_id,
        is_booking         = COALESCE(EXCLUDED.is_booking, public.booking.is_booking),
        service_code       = EXCLUDED.service_code,
        price_cents        = EXCLUDED.price_cents,
        start_time         = EXCLUDED.start_time,
        end_time           = EXCLUDED.end_time,
        pickup_location    = COALESCE(EXCLUDED.pickup_location, public.booking.pickup_location),
        extended           = COALESCE(EXCLUDED.extended, '{}'::jsonb),
        event_title        = COALESCE(EXCLUDED.event_title, public.booking.event_title),
        first_name         = COALESCE(EXCLUDED.first_name, public.booking.first_name),
        last_name          = COALESCE(EXCLUDED.last_name, public.booking.last_name),
        email              = COALESCE(EXCLUDED.email, public.booking.email),
        mobile             = COALESCE(EXCLUDED.mobile, public.booking.mobile),
        is_paid            = COALESCE(EXCLUDED.is_paid, public.booking.is_paid),
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

COMMENT ON FUNCTION public.upsert_booking_from_google IS 'Upserts booking from Google Calendar event. Includes is_paid flag for admin-created bookings.';
