-- =====================================================================
-- AUTO MAN DRIVING SCHOOL - DATABASE SCHEMA (PUBLIC SCHEMA ONLY)
-- =====================================================================
-- Generated FROM pg_dump, cleaned to include only public schema elements
-- Excludes: auth, extensions, graphql, pgbouncer, realtime, storage, vault schemas
-- =====================================================================

-- =====================================================================
-- EXTENSIONS
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- =====================================================================
-- ENUMS
-- =====================================================================

CREATE TYPE public.booking_status AS ENUM (
    'confirmed',
    'completed',
    'cancelled',
    'no_show'
);

CREATE TYPE public.msg_status AS ENUM (
    'pending',
    'sent',
    'delivered',
    'failed'
);

-- =====================================================================
-- CORE TABLES
-- =====================================================================

-- Client table: stores customer information
CREATE TABLE public.client (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    email text NOT NULL,
    first_name text,
    last_name text,
    mobile text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    learner_permit_number text,
    date_of_birth date,
    address text,
    emergency_contact_name text,
    emergency_contact_phone text,
    medical_conditions text,
    is_anxious_nervous boolean DEFAULT false,
    is_beginner boolean DEFAULT false,
    is_senior boolean DEFAULT false,
    learning_needs_other text,
    notes text,
    is_admin boolean DEFAULT false NOT NULL,
    intake_completed boolean DEFAULT false
);

COMMENT ON COLUMN public.client.intake_completed IS 'Tracks whether client has completed the intake form (permit/licence AND medical conditions)';

-- Service table: defines available driving lesson services
CREATE TABLE public.service (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    duration_minutes integer NOT NULL,
    price_cents integer NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    google_booking_url text,
    sort_order integer,
    CONSTRAINT service_google_booking_url_format CHECK (((google_booking_url IS NULL) OR (google_booking_url ~ '^https://calendar\.app\.google/[A-Za-z0-9]+$'::text)))
);

-- Package table: defines lesson packages for bulk purchase
CREATE TABLE public.package (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    lesson_count integer NOT NULL,
    price_cents integer NOT NULL,
    validity_months integer DEFAULT 12,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

-- Booking table: main booking/appointment records
CREATE TABLE public.booking (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    client_id uuid,
    google_event_id text NOT NULL,
    google_calendar_id text NOT NULL,
    source text DEFAULT 'google'::text NOT NULL,
    service_code text,
    price_cents integer,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    timezone text DEFAULT 'Australia/Melbourne'::text,
    status public.booking_status DEFAULT 'confirmed'::public.booking_status NOT NULL,
    pickup_location text,
    extended jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cancelled_at timestamp with time zone,
    start_date date,
    is_deleted boolean DEFAULT false,
    start_minute timestamp with time zone,
    first_name text,
    last_name text,
    email text,
    mobile text,
    google_booking_url text,
    google_html_link text,
    google_ical_uid text,
    is_booking boolean DEFAULT false,
    event_title text,
    is_cancelled boolean GENERATED ALWAYS AS ((status = 'cancelled'::public.booking_status)) STORED,
    sms_confirm_sent_at timestamp with time zone,
    gcal_sequence integer,
    email_confirm_sent_at timestamp with time zone,
    sms_reminder_sent_at timestamp with time zone,
    refunded boolean DEFAULT false,
    refunded_at timestamp with time zone,
    cancelled_by text,
    refund_eligible boolean,
    CONSTRAINT booking_price_nonneg CHECK (((price_cents IS NULL) OR (price_cents >= 0))),
    CONSTRAINT booking_time_valid CHECK ((end_time > start_time))
);

COMMENT ON COLUMN public.booking.refunded IS 'Whether a refund has been processed for this cancelled booking';
COMMENT ON COLUMN public.booking.refunded_at IS 'Timestamp when the refund was marked as processed';
COMMENT ON COLUMN public.booking.cancelled_by IS 'Email of person who cancelled (client email, admin email, OR NULL for unknown/Google sync)';
COMMENT ON COLUMN public.booking.refund_eligible IS 'Automatically calculated: TRUE IF cancelled 24+ hours before start_time, FALSE IF <24h, NULL IF NOT cancelled';

-- Client credit table: tracks lesson package credits
CREATE TABLE public.client_credit (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    client_id uuid,
    package_id uuid,
    credits_total integer NOT NULL,
    credits_used integer DEFAULT 0,
    credits_remaining integer NOT NULL,
    purchased_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    payment_amount_cents integer NOT NULL,
    payment_method text,
    payment_reference text,
    CONSTRAINT credits_nonneg CHECK (((credits_total >= 0) AND (credits_used >= 0) AND (credits_remaining >= 0)))
);

-- Client progress table: tracks skill development
CREATE TABLE public.client_progress (
    email text NOT NULL,
    skills jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text,
    updated_at timestamp with time zone DEFAULT now()
);

-- Contact messages table: stores contact form submissions
CREATE TABLE public.contact_messages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    is_read boolean DEFAULT false
);

COMMENT ON COLUMN public.contact_messages.is_read IS 'Tracks whether admin has read this contact message';

-- SMS log table: tracks SMS messages sent
CREATE TABLE public.sms_log (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    booking_id uuid,
    client_id uuid,
    to_phone text NOT NULL,
    template text NOT NULL,
    body text NOT NULL,
    provider text,
    provider_message_id text,
    status public.msg_status DEFAULT 'pending'::public.msg_status,
    error_message text,
    sent_at timestamp with time zone DEFAULT now(),
    delivered_at timestamp with time zone
);

-- Email log table: tracks emails sent
CREATE TABLE public.email_log (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    booking_id uuid,
    client_id uuid,
    to_email text NOT NULL,
    type text NOT NULL,
    subject text NOT NULL,
    status public.msg_status DEFAULT 'pending'::public.msg_status,
    error_message text,
    sent_at timestamp with time zone DEFAULT now(),
    opened_at timestamp with time zone
);

-- SMS queue table: queues SMS messages to be sent
CREATE TABLE public.sms_queue (
    id bigint NOT NULL,
    phone text NOT NULL,
    body text NOT NULL,
    send_after timestamp with time zone DEFAULT now() NOT NULL,
    dedupe_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone
);

CREATE SEQUENCE public.sms_queue_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.sms_queue_id_seq OWNED BY public.sms_queue.id;
ALTER TABLE ONLY public.sms_queue ALTER COLUMN id SET DEFAULT nextval('public.sms_queue_id_seq'::regclass);

-- Google Calendar state table: tracks sync state
CREATE TABLE public.gcal_state (
    calendar_id text NOT NULL,
    sync_token text,
    last_history_id text,
    channel_id text,
    resource_id text,
    channel_expiration timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Google Calendar sync log table: logs sync operations
CREATE TABLE public.gcal_sync_log (
    id bigint NOT NULL,
    calendar_id text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    status text DEFAULT 'running'::text NOT NULL,
    synced_count integer DEFAULT 0,
    inserted_count integer DEFAULT 0,
    updated_count integer DEFAULT 0,
    error_message text
);

CREATE SEQUENCE public.gcal_sync_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.gcal_sync_log_id_seq OWNED BY public.gcal_sync_log.id;
ALTER TABLE ONLY public.gcal_sync_log ALTER COLUMN id SET DEFAULT nextval('public.gcal_sync_log_id_seq'::regclass);

-- Google Calendar webhook log table: tracks webhook notifications
CREATE TABLE public.gcal_webhook_log (
    id bigint NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    calendar_id text,
    channel_id text,
    resource_id text,
    message_number text,
    processed boolean DEFAULT false,
    resource_state text
);

CREATE SEQUENCE public.gcal_webhook_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.gcal_webhook_log_id_seq OWNED BY public.gcal_webhook_log.id;
ALTER TABLE ONLY public.gcal_webhook_log ALTER COLUMN id SET DEFAULT nextval('public.gcal_webhook_log_id_seq'::regclass);

-- Legacy tables (kept for backward compatibility)
CREATE TABLE public.schedule_old (
    id integer NOT NULL,
    name text DEFAULT 'Default'::text NOT NULL,
    timezone text DEFAULT 'Australia/Melbourne'::text NOT NULL
);

CREATE SEQUENCE public.schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.schedule_id_seq OWNED BY public.schedule_old.id;
ALTER TABLE ONLY public.schedule_old ALTER COLUMN id SET DEFAULT nextval('public.schedule_id_seq'::regclass);

CREATE TABLE public.availability_slot_old (
    id integer NOT NULL,
    schedule_id integer,
    service_id integer,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    is_booked boolean DEFAULT false NOT NULL
);

CREATE SEQUENCE public.availability_slot_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.availability_slot_id_seq OWNED BY public.availability_slot_old.id;
ALTER TABLE ONLY public.availability_slot_old ALTER COLUMN id SET DEFAULT nextval('public.availability_slot_id_seq'::regclass);

-- =====================================================================
-- FUNCTIONS
-- =====================================================================

-- Function: Handle new user creation (creates client record)
CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  -- Insert a new client record with the user's email
  INSERT INTO public.client (id, email, created_at, updated_at)
  VALUES (
    new.id,   -- Use the same UUID as auth.users for easy linking
    new.email,
    now(),
    now()
  )
  ON CONFLICT (email) DO NOTHING;  -- Skip IF email already exists
  
  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates a client record when a new user signs up via Supabase Auth';

-- Function: Check IF current user is admin
CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(auth.jwt()->>'email', '') 
  in ('darren@automandrivingschool.com.au');
$$;

-- Function: SET updated_at timestamp
CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

-- Function: SET client progress updated timestamp
CREATE FUNCTION public.set_client_progress_updated() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

-- Function: UPDATE credits remaining
CREATE FUNCTION public.update_credits_remaining() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  new.credits_remaining := new.credits_total - new.credits_used;
  RETURN new;
END;
$$;

-- Function: SET booking start date
CREATE FUNCTION public.booking_set_start_date() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  new.start_date := (new.start_time at time zone 'Australia/Melbourne')::date;
  RETURN new;
END;
$$;

-- Function: SET booking start minute
CREATE FUNCTION public.booking_set_start_minute() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  new.start_minute := date_trunc('minute', new.start_time);
  RETURN new;
END;
$$;

-- Function: Calculate refund eligibility
CREATE FUNCTION public.calculate_refund_eligible(p_start_time timestamp with time zone, p_cancelled_at timestamp with time zone, p_status public.booking_status) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
BEGIN
  -- Only cancelled bookings can be refund eligible
  IF p_status != 'cancelled' OR p_cancelled_at IS NULL OR p_start_time IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Cancelled 24+ hours before start_time = eligible
  RETURN (EXTRACT(EPOCH FROM (p_start_time - p_cancelled_at)) / 3600) >= 24;
END;
$$;

-- Function: UPDATE refund eligibility
CREATE FUNCTION public.update_refund_eligible() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.refund_eligible := public.calculate_refund_eligible(
    NEW.start_time,
    NEW.cancelled_at,
    NEW.status
  );
  RETURN NEW;
END;
$$;

-- Function: Mark booking as cancelled
CREATE FUNCTION public.mark_booking_cancelled(p_google_event_id text, p_cancelled_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE booking
  SET 
    status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, p_cancelled_at, NOW()),  -- Use provided timestamp, fallback to NOW()
    updated_at = NOW()
  WHERE google_event_id = p_google_event_id
    AND status != 'cancelled';  -- Only UPDATE IF NOT already cancelled
END;
$$;

-- Function: Mark past bookings as completed
CREATE FUNCTION public.mark_past_bookings_completed() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE public.booking
  SET
    status = 'completed',
    updated_at = now()
  WHERE
    status = 'confirmed'
    AND end_time < now();  -- end_time is timestamptz, so this is safe
END;
$$;

-- Function: Map service code FROM Google Calendar event
CREATE FUNCTION public.map_service_code(p_summary text, p_minutes integer) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_code      text;
  v_is_senior boolean := false;
  v_is_manual boolean := false;
  v_is_auto   boolean := false;
  v_mins      int     := p_minutes;
  v_num       text;
BEGIN
  -- 1) Prefer explicit [code] in title, e.g. "Automatic 1h [auto_60]"
  IF p_summary ~ '\[[A-Za-z0-9_]+\]' THEN
    v_code := regexp_replace(p_summary, '.*\[(\w+)\].*', '\1');
    RETURN v_code;
  end IF;

  -- 2) Extract flags FROM keywords
  v_is_senior := p_summary ILIKE '%senior%';
  v_is_manual := p_summary ILIKE '%manual%';
  v_is_auto   := p_summary ILIKE '%automatic%' OR (NOT v_is_manual);  -- default to auto IF NOT manual

  -- 3) IF minutes NOT provided, try to parse (e.g., "1.5", "1.5h", "2 hour")
  IF v_mins is null OR v_mins <= 0 THEN
    -- get the first number like 1, 1.5, 2, 2.0
    SELECT (regexp_matches(p_summary, '(\d+(?:\.\d+)?)', 'i'))[1]
      INTO v_num;

    IF v_num is NOT null THEN
      v_mins := CEIL((v_num)::numeric * 60)::int;  -- '1.5' => 90
    end IF;
  end IF;

  -- 4) Normalize minutes INTO our SKUs
  IF v_mins BETWEEN 1 AND 70 THEN
    v_mins := 60;
  ELSIF v_mins BETWEEN 71 AND 105 THEN
    v_mins := 90;
  ELSE
    v_mins := 120;
  end IF;

  -- 5) Compose code
  IF v_is_senior AND v_is_manual THEN
    RETURN FORMAT('senior_manual_%s', v_mins);
  ELSIF v_is_senior THEN
    RETURN FORMAT('senior_auto_%s', v_mins);
  ELSIF v_is_manual THEN
    RETURN FORMAT('manual_%s', v_mins);
  ELSE
    RETURN FORMAT('auto_%s', v_mins);
  end IF;
END;
$$;

-- Function: Upsert booking FROM Google Calendar
CREATE FUNCTION public.upsert_booking_from_google(p_google_event_id text, p_calendar_id text, p_client_email text, p_first_name text, p_last_name text, p_mobile text, p_service_code text, p_price_cents integer, p_start timestamptz, p_end timestamptz, p_pickup text, p_extended jsonb, p_is_booking boolean, p_title text, p_client_id uuid DEFAULT NULL) RETURNS TABLE(booking_id uuid, was_inserted boolean, sms_sent_at timestamp with time zone, email_confirm_sent_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_client_id    uuid := p_client_id;
  v_booking_id   uuid;
  v_was_inserted boolean;
  v_sms_sent_at  timestamptz;
  v_email_sent_at timestamptz;
BEGIN
  -- Upsert client (only IF client_id not provided AND email is available)
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
    SET client_id          = COALESCE(public.booking.client_id, EXCLUDED.client_id),
        google_calendar_id = EXCLUDED.google_calendar_id,
        is_booking         = COALESCE(EXCLUDED.is_booking, public.booking.is_booking),
        service_code       = EXCLUDED.service_code,
        price_cents        = EXCLUDED.price_cents,
        start_time         = EXCLUDED.start_time,
        end_time           = EXCLUDED.end_time,
        pickup_location    = COALESCE(public.booking.pickup_location, EXCLUDED.pickup_location),
        extended           = COALESCE(EXCLUDED.extended, '{}'::jsonb),
        event_title        = COALESCE(EXCLUDED.event_title, public.booking.event_title),
        first_name         = COALESCE(EXCLUDED.first_name, public.booking.first_name),
        last_name          = COALESCE(EXCLUDED.last_name, public.booking.last_name),
        email              = COALESCE(EXCLUDED.email, public.booking.email),
        mobile             = COALESCE(EXCLUDED.mobile, public.booking.mobile),
        updated_at         = now()
  RETURNING public.booking.id,
            public.booking.sms_confirm_sent_at,
            public.booking.email_confirm_sent_at,
            (xmax = 0)
    INTO v_booking_id, v_sms_sent_at, v_email_sent_at, v_was_inserted;

  -- RETURN the result with all required fields
  RETURN query
    SELECT v_booking_id, v_was_inserted, v_sms_sent_at, v_email_sent_at;
END;
$$;

-- Function: Log Google Calendar event action
CREATE FUNCTION public.log_gcal_event_action(p_sync_log_id bigint, p_calendar_id text, p_event_id text, p_booking_id bigint, p_action text, p_message text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public.gcal_sync_event_log (
    sync_log_id, calendar_id, event_id, booking_id, action, message
  )
  VALUES (
    p_sync_log_id,
    p_calendar_id,
    p_event_id,
    p_booking_id,
    p_action,
    p_message
  );
END;
$$;

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- Trigger: Auto-create client on new auth user
CREATE TRIGGER on_auth_user_created 
    AFTER INSERT ON auth.users 
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_new_user();

-- Trigger: UPDATE timestamp on client changes
CREATE TRIGGER t_client_updated 
    BEFORE UPDATE ON public.client 
    FOR EACH ROW 
    EXECUTE FUNCTION public.set_updated_at();

-- Trigger: UPDATE timestamp on booking changes
CREATE TRIGGER t_booking_updated 
    BEFORE UPDATE ON public.booking 
    FOR EACH ROW 
    EXECUTE FUNCTION public.set_updated_at();

-- Trigger: UPDATE timestamp on client progress changes
CREATE TRIGGER t_client_progress_updated 
    BEFORE UPDATE ON public.client_progress 
    FOR EACH ROW 
    EXECUTE FUNCTION public.set_client_progress_updated();

-- Trigger: UPDATE remaining credits on client_credit changes
CREATE TRIGGER t_client_credit_remaining 
    BEFORE INSERT OR UPDATE ON public.client_credit 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_credits_remaining();

-- Trigger: SET booking start date
CREATE TRIGGER trg_booking_set_start_date 
    BEFORE INSERT OR UPDATE OF start_time ON public.booking 
    FOR EACH ROW 
    EXECUTE FUNCTION public.booking_set_start_date();

-- Trigger: SET booking start minute
CREATE TRIGGER trg_booking_set_start_minute 
    BEFORE INSERT OR UPDATE OF start_time ON public.booking 
    FOR EACH ROW 
    EXECUTE FUNCTION public.booking_set_start_minute();

-- Trigger: UPDATE refund eligibility
CREATE TRIGGER trigger_update_refund_eligible 
    BEFORE INSERT OR UPDATE OF start_time, cancelled_at, status ON public.booking 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_refund_eligible();

-- =====================================================================
-- PRIMARY KEYS
-- =====================================================================

ALTER TABLE ONLY public.client
    ADD CONSTRAINT client_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client
    ADD CONSTRAINT client_email_key UNIQUE (email);

ALTER TABLE ONLY public.service
    ADD CONSTRAINT service_pkey1 PRIMARY KEY (id);

ALTER TABLE ONLY public.service
    ADD CONSTRAINT service_code_key UNIQUE (code);

ALTER TABLE ONLY public.package
    ADD CONSTRAINT package_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.package
    ADD CONSTRAINT package_name_key UNIQUE (name);

ALTER TABLE ONLY public.booking
    ADD CONSTRAINT booking_pkey1 PRIMARY KEY (id);

ALTER TABLE ONLY public.booking
    ADD CONSTRAINT booking_google_event_id_key UNIQUE (google_event_id);

ALTER TABLE ONLY public.client_credit
    ADD CONSTRAINT client_credit_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_progress
    ADD CONSTRAINT client_progress_pkey PRIMARY KEY (email);

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sms_log
    ADD CONSTRAINT sms_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sms_queue
    ADD CONSTRAINT sms_queue_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.gcal_state
    ADD CONSTRAINT gcal_state_pkey PRIMARY KEY (calendar_id);

ALTER TABLE ONLY public.gcal_sync_log
    ADD CONSTRAINT gcal_sync_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.gcal_webhook_log
    ADD CONSTRAINT gcal_webhook_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.schedule_old
    ADD CONSTRAINT schedule_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.availability_slot_old
    ADD CONSTRAINT availability_slot_pkey PRIMARY KEY (id);

-- =====================================================================
-- INDEXES
-- =====================================================================

-- Client indexes
CREATE INDEX idx_client_email ON public.client USING btree (email);
CREATE INDEX idx_client_intake_completed ON public.client USING btree (intake_completed) WHERE (intake_completed = false);

-- Service indexes
CREATE INDEX idx_service_sort_order ON public.service USING btree (sort_order);

-- Booking indexes
CREATE INDEX idx_booking_client_id ON public.booking USING btree (client_id);
CREATE INDEX idx_booking_email ON public.booking USING btree (email);
CREATE INDEX idx_booking_google_event_id ON public.booking USING btree (google_event_id);
CREATE INDEX idx_booking_start_time ON public.booking USING btree (start_time);
CREATE INDEX idx_booking_end_time ON public.booking USING btree (end_time);
CREATE INDEX idx_booking_start_date ON public.booking USING btree (start_date);
CREATE INDEX idx_booking_status ON public.booking USING btree (status);
CREATE INDEX idx_booking_upcoming ON public.booking USING btree (start_time) WHERE (status = 'confirmed'::public.booking_status);
CREATE INDEX idx_booking_email_confirm ON public.booking USING btree (email_confirm_sent_at) WHERE (email_confirm_sent_at IS NOT NULL);
CREATE INDEX idx_booking_refunded ON public.booking USING btree (refunded) WHERE (refunded = true);
CREATE INDEX idx_booking_refund_eligible ON public.booking USING btree (refund_eligible) WHERE (status = 'cancelled'::public.booking_status);
CREATE INDEX booking_reminder_scan_idx ON public.booking USING btree (start_time) WHERE ((is_booking IS TRUE) AND ((status IS NULL) OR (status = 'confirmed'::public.booking_status)) AND (sms_reminder_sent_at IS NULL));

-- Unique constraint indexes
CREATE UNIQUE INDEX ux_booking_client_start_min ON public.booking USING btree (client_id, start_minute) WHERE ((source = 'portal'::text) AND (is_deleted = false));

-- Contact messages indexes
CREATE INDEX idx_contact_messages_created ON public.contact_messages USING btree (created_at DESC);
CREATE INDEX idx_contact_messages_is_read ON public.contact_messages USING btree (is_read);

-- SMS/Email log indexes
CREATE INDEX idx_sms_booking ON public.sms_log USING btree (booking_id);
CREATE INDEX idx_email_booking ON public.email_log USING btree (booking_id);
CREATE UNIQUE INDEX ux_sms_once_per_type ON public.sms_log USING btree (booking_id, template) WHERE (status = ANY (ARRAY['pending'::public.msg_status, 'sent'::public.msg_status, 'delivered'::public.msg_status]));
CREATE UNIQUE INDEX ux_email_once_per_type ON public.email_log USING btree (booking_id, type) WHERE (status = ANY (ARRAY['pending'::public.msg_status, 'sent'::public.msg_status, 'delivered'::public.msg_status]));

-- SMS queue indexes
CREATE UNIQUE INDEX sms_queue_dedupe_idx ON public.sms_queue USING btree (dedupe_key);

-- Google Calendar indexes
CREATE UNIQUE INDEX gcal_webhook_log_dedupe ON public.gcal_webhook_log USING btree (channel_id, message_number) WHERE (message_number IS NOT NULL);

-- =====================================================================
-- FOREIGN KEYS
-- =====================================================================

ALTER TABLE ONLY public.booking
    ADD CONSTRAINT booking_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.booking
    ADD CONSTRAINT booking_service_code_fkey FOREIGN KEY (service_code) REFERENCES public.service(code) ON DELETE RESTRICT;

ALTER TABLE ONLY public.client_credit
    ADD CONSTRAINT client_credit_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.client_credit
    ADD CONSTRAINT client_credit_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.package(id);

ALTER TABLE ONLY public.sms_log
    ADD CONSTRAINT sms_log_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.booking(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sms_log
    ADD CONSTRAINT sms_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.booking(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_log
    ADD CONSTRAINT email_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.availability_slot_old
    ADD CONSTRAINT availability_slot_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.schedule_old(id) ON DELETE CASCADE;

-- =====================================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================================

ALTER TABLE public.client ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_credit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gcal_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gcal_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gcal_webhook_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_slot_old ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_old ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- RLS POLICIES
-- =====================================================================

-- Client policies
CREATE POLICY client_select ON public.client FOR SELECT TO authenticated 
    USING (public.is_admin() OR (email = COALESCE(( SELECT (auth.jwt() ->> 'email'::text) AS text), ''::text)));

CREATE POLICY client_insert ON public.client FOR INSERT TO authenticated, anon 
    WITH CHECK (((( SELECT auth.role() AS role) = 'service_role'::text) OR public.is_admin() OR (email = COALESCE(( SELECT (auth.jwt() ->> 'email'::text)), ''::text))));

CREATE POLICY client_update ON public.client FOR UPDATE TO authenticated 
    USING ((public.is_admin() OR (email = COALESCE((auth.jwt() ->> 'email'::text), ''::text)))) 
    WITH CHECK ((public.is_admin() OR (email = COALESCE((auth.jwt() ->> 'email'::text), ''::text))));

-- Service policies
CREATE POLICY "Users can read active services" ON public.service FOR SELECT TO authenticated, anon 
    USING ((is_active = true));

CREATE POLICY "Service role full access service" ON public.service TO service_role 
    USING (true);

-- Package policies
CREATE POLICY "Users can read active packages" ON public.package FOR SELECT TO authenticated, anon 
    USING ((is_active = true));

CREATE POLICY "Service role full access package" ON public.package TO service_role 
    USING (true);

-- Booking policies
CREATE POLICY booking_select ON public.booking FOR SELECT TO authenticated 
    USING ((public.is_admin() OR (client_id IN ( SELECT client.id FROM public.client WHERE (client.email = COALESCE(( SELECT (auth.jwt() ->> 'email'::text)), ''::text))))));

CREATE POLICY booking_mutate ON public.booking TO authenticated, anon 
    USING (((( SELECT auth.role() AS role) = 'service_role'::text) OR public.is_admin())) 
    WITH CHECK (((( SELECT auth.role() AS role) = 'service_role'::text) OR public.is_admin()));

-- Client credit policies
CREATE POLICY "Users can read own credits" ON public.client_credit FOR SELECT TO authenticated 
    USING ((client_id IN ( SELECT client.id FROM public.client WHERE (client.email = (auth.jwt() ->> 'email'::text)))));

CREATE POLICY "Service role full access client_credit" ON public.client_credit TO service_role 
    USING (true);

-- Client progress policies
CREATE POLICY client_progress_all ON public.client_progress TO authenticated, anon 
    USING (((auth.role() = 'service_role'::text) OR public.is_admin())) 
    WITH CHECK (((auth.role() = 'service_role'::text) OR public.is_admin()));

CREATE POLICY "Service role full access client_progress" ON public.client_progress TO service_role 
    USING (true);

-- Contact messages policies
CREATE POLICY "Allow public to insert contact messages" ON public.contact_messages FOR INSERT TO authenticated, anon 
    WITH CHECK (true);

CREATE POLICY "Anon can insert messages" ON public.contact_messages FOR INSERT TO authenticated, anon 
    WITH CHECK (true);

CREATE POLICY contact_messages_insert ON public.contact_messages FOR INSERT TO authenticated, anon 
    WITH CHECK (true);

CREATE POLICY "Users can read own messages" ON public.contact_messages FOR SELECT TO authenticated 
    USING (((auth.jwt() ->> 'email'::text) = email));

CREATE POLICY contact_messages_select ON public.contact_messages FOR SELECT TO authenticated 
    USING (public.is_admin());

CREATE POLICY "Allow admin to read contact messages" ON public.contact_messages FOR SELECT TO authenticated 
    USING ((EXISTS ( SELECT 1 FROM public.client WHERE ((client.id = auth.uid()) AND (client.is_admin = true)))));

CREATE POLICY "Allow authenticated to UPDATE contact messages" ON public.contact_messages FOR UPDATE TO authenticated 
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access contact_messages" ON public.contact_messages TO service_role 
    USING (true);

-- SMS log policies
CREATE POLICY sms_log_read_read ON public.sms_log FOR SELECT TO authenticated 
    USING (public.is_admin());

CREATE POLICY sms_log_write_write ON public.sms_log TO authenticated, anon 
    USING (((auth.role() = 'service_role'::text) OR public.is_admin())) 
    WITH CHECK (((auth.role() = 'service_role'::text) OR public.is_admin()));

CREATE POLICY "Service role full access sms_log" ON public.sms_log TO service_role 
    USING (true);

-- Email log policies
CREATE POLICY email_log_read_read ON public.email_log FOR SELECT TO authenticated 
    USING (public.is_admin());

CREATE POLICY email_log_write_write ON public.email_log TO authenticated, anon 
    USING (((auth.role() = 'service_role'::text) OR public.is_admin())) 
    WITH CHECK (((auth.role() = 'service_role'::text) OR public.is_admin()));

CREATE POLICY "Service role full access email_log" ON public.email_log TO service_role 
    USING (true);

-- SMS queue policies
CREATE POLICY "Service role full access sms_queue" ON public.sms_queue TO service_role 
    USING (true);

-- Google Calendar state policies
CREATE POLICY gcal_state_read_read ON public.gcal_state FOR SELECT TO authenticated 
    USING (public.is_admin());

CREATE POLICY gcal_state_write_write ON public.gcal_state TO authenticated, anon 
    USING (((auth.role() = 'service_role'::text) OR public.is_admin())) 
    WITH CHECK (((auth.role() = 'service_role'::text) OR public.is_admin()));

CREATE POLICY "Service role full access gcal_state" ON public.gcal_state TO service_role 
    USING (true);

-- Google Calendar sync log policies
CREATE POLICY gcal_sync_log_read_read ON public.gcal_sync_log FOR SELECT TO authenticated 
    USING (public.is_admin());

CREATE POLICY gcal_sync_log_write_write ON public.gcal_sync_log TO authenticated, anon 
    USING (((auth.role() = 'service_role'::text) OR public.is_admin())) 
    WITH CHECK (((auth.role() = 'service_role'::text) OR public.is_admin()));

CREATE POLICY "Service role full access gcal_sync_log" ON public.gcal_sync_log TO service_role 
    USING (true);

-- Google Calendar webhook log policies
CREATE POLICY gcal_webhook_log_read_read ON public.gcal_webhook_log FOR SELECT TO authenticated 
    USING (public.is_admin());

CREATE POLICY gcal_webhook_log_write_write ON public.gcal_webhook_log TO authenticated, anon 
    USING (((auth.role() = 'service_role'::text) OR public.is_admin())) 
    WITH CHECK (((auth.role() = 'service_role'::text) OR public.is_admin()));

CREATE POLICY "Service role full access gcal_webhook_log" ON public.gcal_webhook_log TO service_role 
    USING (true);

-- Legacy table policies
CREATE POLICY schedule_select_public ON public.schedule_old FOR SELECT 
    USING (true);

CREATE POLICY slot_select_free ON public.availability_slot_old FOR SELECT 
    USING ((is_booked = false));

-- =====================================================================
-- END OF SCHEMA
-- =====================================================================

