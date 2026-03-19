create or replace function public.upsert_booking_from_google(
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
    p_client_id uuid default null,
    p_is_admin_booking boolean default false
)
returns table(
  booking_id uuid,
  was_inserted boolean,
  sms_sent_at timestamp with time zone,
  email_confirm_sent_at timestamp with time zone
)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_client_id uuid := p_client_id;
  v_booking_id uuid;
  v_was_inserted boolean;
  v_sms_sent_at timestamptz;
  v_email_sent_at timestamptz;
  v_client_is_test boolean := false;
  v_booking_is_test boolean;
  v_sms_enabled boolean;
  v_email_enabled boolean;
begin
  if v_client_id is null and nullif(trim(p_client_email), '') is not null then
    insert into public.client (email, first_name, last_name, mobile)
    values (p_client_email, p_first_name, p_last_name, p_mobile)
    on conflict (email) do update
      set first_name = coalesce(public.client.first_name, excluded.first_name),
          last_name  = coalesce(public.client.last_name, excluded.last_name),
          mobile     = coalesce(public.client.mobile, excluded.mobile),
          updated_at = now()
    returning id into v_client_id;
  end if;

  if v_client_id is not null then
    select coalesce(is_test, false)
    into v_client_is_test
    from public.client
    where id = v_client_id;
  end if;

  v_booking_is_test := v_client_is_test;
  v_sms_enabled := not v_client_is_test;
  v_email_enabled := not v_client_is_test;

  insert into public.booking (
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
    is_test,
    is_sms_enabled,
    is_email_enabled,
    is_admin_booking
  )
  values (
    v_client_id,
    p_google_event_id,
    p_calendar_id,
    'google',
    coalesce(p_is_booking, true),
    p_service_code,
    p_price_cents,
    p_start,
    p_end,
    p_pickup,
    coalesce(p_extended, '{}'::jsonb),
    p_title,
    p_first_name,
    p_last_name,
    p_client_email,
    p_mobile,
    v_booking_is_test,
    v_sms_enabled,
    v_email_enabled,
    p_is_admin_booking
  )
  on conflict (google_event_id) do update
  set
    client_id = coalesce(public.booking.client_id, excluded.client_id),
    google_calendar_id = excluded.google_calendar_id,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    pickup_location = coalesce(public.booking.pickup_location, excluded.pickup_location),
    extended = coalesce(excluded.extended, '{}'::jsonb),
    event_title = coalesce(excluded.event_title, public.booking.event_title),
    is_admin_booking = public.booking.is_admin_booking or excluded.is_admin_booking,
    updated_at = now()
  returning
    public.booking.id,
    public.booking.sms_confirm_sent_at,
    public.booking.email_confirm_sent_at,
    (xmax = 0)
  into
    v_booking_id,
    v_sms_sent_at,
    v_email_sent_at,
    v_was_inserted;

  return query
    select v_booking_id, v_was_inserted, v_sms_sent_at, v_email_sent_at;
end;
$$;