-- Enable UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================= CORE TABLES =================
CREATE TABLE IF NOT EXISTS client (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name  TEXT,
  mobile     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  learner_permit_number TEXT,
  date_of_birth DATE,
  address TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  medical_conditions TEXT,
  is_anxious_nervous BOOLEAN DEFAULT FALSE,
  is_beginner        BOOLEAN DEFAULT FALSE,
  is_senior          BOOLEAN DEFAULT FALSE,
  learning_needs_other TEXT,
  notes TEXT
);

-- booking table includes contact snapshot + google links
CREATE TABLE IF NOT EXISTS booking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES client(id) ON DELETE SET NULL,

  -- Google linkage
  google_event_id    TEXT NOT NULL UNIQUE,
  google_calendar_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'google',            -- 'google' | 'portal'

  -- Service / pricing / timing
  service_code TEXT NOT NULL,
  price_cents  INTEGER NOT NULL,
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ NOT NULL,
  timezone     TEXT DEFAULT 'Australia/Melbourne',
  status       TEXT NOT NULL DEFAULT 'confirmed',

  -- Booking form snapshot (contact details at time of booking)
  first_name TEXT,
  last_name  TEXT,
  email      TEXT,
  mobile     TEXT,

  pickup_location TEXT,
  extended JSONB,

  -- Google event/page links (htmlLink, iCalUID, booking page url)
  google_booking_url TEXT,
  google_html_link   TEXT,
  google_ical_uid    TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sms_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES booking(id) ON DELETE CASCADE,
  client_id  UUID REFERENCES client(id)  ON DELETE SET NULL,
  to_phone TEXT NOT NULL,
  template TEXT NOT NULL,
  body TEXT NOT NULL,
  provider TEXT,
  provider_message_id TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES booking(id) ON DELETE CASCADE,
  client_id  UUID REFERENCES client(id)  ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  type     TEXT NOT NULL,
  subject  TEXT NOT NULL,
  status   TEXT DEFAULT 'pending',
  error_message TEXT,
  sent_at  TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ
);

-- service table (with google_booking_url + sort_order)
CREATE TABLE IF NOT EXISTS service (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  google_booking_url TEXT,
  sort_order INTEGER,                           -- NEW: defines display order
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS package (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  lesson_count INTEGER NOT NULL,
  price_cents   INTEGER NOT NULL,
  validity_months INTEGER DEFAULT 12,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_credit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id  UUID REFERENCES client(id)  ON DELETE CASCADE,
  package_id UUID REFERENCES package(id),
  credits_total     INTEGER NOT NULL,
  credits_used      INTEGER DEFAULT 0,
  credits_remaining INTEGER NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ,
  payment_amount_cents INTEGER NOT NULL,
  payment_method   TEXT,
  payment_reference TEXT
);

-- ================= TRIGGERS =================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_client_updated ON client;
CREATE TRIGGER t_client_updated  BEFORE UPDATE ON client  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create client record when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.client (id, email, created_at, updated_at)
  VALUES (NEW.id, NEW.email, NOW(), NOW())
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS t_booking_updated ON booking;
CREATE TRIGGER t_booking_updated BEFORE UPDATE ON booking FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION update_credits_remaining() RETURNS TRIGGER AS $$
BEGIN NEW.credits_remaining = NEW.credits_total - NEW.credits_used; RETURN NEW; END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS t_client_credit_remaining ON client_credit;
CREATE TRIGGER t_client_credit_remaining BEFORE INSERT OR UPDATE ON client_credit
FOR EACH ROW EXECUTE FUNCTION update_credits_remaining();

-- ================= ENUMS & CONVERSIONS =================
DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('confirmed','completed','cancelled','no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE msg_status AS ENUM ('pending','sent','delivered','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE booking  ALTER COLUMN status DROP DEFAULT;
ALTER TABLE booking  ALTER COLUMN status TYPE booking_status USING status::text::booking_status;
ALTER TABLE booking  ALTER COLUMN status SET DEFAULT 'confirmed'::booking_status;

ALTER TABLE sms_log  ALTER COLUMN status DROP DEFAULT;
ALTER TABLE sms_log  ALTER COLUMN status TYPE msg_status USING status::text::msg_status;
ALTER TABLE sms_log  ALTER COLUMN status SET DEFAULT 'pending'::msg_status;

ALTER TABLE email_log ALTER COLUMN status DROP DEFAULT;
ALTER TABLE email_log ALTER COLUMN status TYPE msg_status USING status::text::msg_status;
ALTER TABLE email_log ALTER COLUMN status SET DEFAULT 'pending'::msg_status;

-- ================= CONSTRAINTS =================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='booking_price_nonneg') THEN
    ALTER TABLE booking ADD CONSTRAINT booking_price_nonneg CHECK (price_cents >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='booking_time_valid') THEN
    ALTER TABLE booking ADD CONSTRAINT booking_time_valid CHECK (end_time > start_time);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='service_google_booking_url_format') THEN
    ALTER TABLE service
      ADD CONSTRAINT service_google_booking_url_format
      CHECK (
        google_booking_url IS NULL
        OR google_booking_url ~ '^https://calendar\.app\.google/[A-Za-z0-9]+$'
      );
  END IF;
END $$;

-- ================= HELPER COLUMNS & TRIGGERS =================
ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS start_date   DATE,
  ADD COLUMN IF NOT EXISTS is_deleted   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS start_minute TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION booking_set_start_date() RETURNS TRIGGER AS $$
BEGIN
  NEW.start_date := (NEW.start_time AT TIME ZONE 'Australia/Melbourne')::date;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_set_start_date ON booking;
CREATE TRIGGER trg_booking_set_start_date
BEFORE INSERT OR UPDATE OF start_time ON booking
FOR EACH ROW EXECUTE FUNCTION booking_set_start_date();

CREATE OR REPLACE FUNCTION booking_set_start_minute() RETURNS TRIGGER AS $$
BEGIN
  NEW.start_minute := date_trunc('minute', NEW.start_time);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_set_start_minute ON booking;
CREATE TRIGGER trg_booking_set_start_minute
BEFORE INSERT OR UPDATE OF start_time ON booking
FOR EACH ROW EXECUTE FUNCTION booking_set_start_minute();

-- ================= INDEXES =================
CREATE INDEX IF NOT EXISTS idx_client_email            ON client(email);
CREATE INDEX IF NOT EXISTS idx_booking_client_id       ON booking(client_id);
CREATE INDEX IF NOT EXISTS idx_booking_google_event_id ON booking(google_event_id);
CREATE INDEX IF NOT EXISTS idx_booking_start_time      ON booking(start_time);
CREATE INDEX IF NOT EXISTS idx_booking_end_time        ON booking(end_time);
CREATE INDEX IF NOT EXISTS idx_booking_status          ON booking(status);
CREATE INDEX IF NOT EXISTS idx_booking_start_date      ON booking(start_date);
CREATE INDEX IF NOT EXISTS idx_booking_email           ON booking(email);
CREATE INDEX IF NOT EXISTS idx_sms_booking             ON sms_log(booking_id);
CREATE INDEX IF NOT EXISTS idx_email_booking           ON email_log(booking_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_sms_once_per_type
  ON sms_log(booking_id, template)
  WHERE status IN ('pending'::msg_status, 'sent'::msg_status, 'delivered'::msg_status);

CREATE UNIQUE INDEX IF NOT EXISTS ux_email_once_per_type
  ON email_log(booking_id, type)
  WHERE status IN ('pending'::msg_status, 'sent'::msg_status, 'delivered'::msg_status);

CREATE INDEX IF NOT EXISTS idx_booking_upcoming
  ON booking(start_time)
  WHERE status = 'confirmed'::booking_status;

CREATE UNIQUE INDEX IF NOT EXISTS ux_booking_client_start_min
  ON booking (client_id, start_minute)
  WHERE source = 'portal' AND is_deleted = FALSE;

-- ================= SEED DATA =================
INSERT INTO package (name, description, lesson_count, price_cents, validity_months) VALUES
  ('3 Lesson Pack',  '3 × 1-hour lessons',                3, 24000, 12),
  ('5 Lesson Pack',  '5 × 1-hour lessons (Most Popular)', 5, 39000, 12),
  ('10 Lesson Pack', '10 × 1-hour lessons',              10, 76000, 12)
ON CONFLICT DO NOTHING;

-- All current services and future services
INSERT INTO service (code, name, description, duration_minutes, price_cents, sort_order, is_active) VALUES
  ('auto_60',  'Automatic Driving Lesson — 1 hour',   'Perfect for beginners and skill improvement', 60,  8500, 1, true),
  ('auto_90',  'Automatic Driving Lesson — 1.5 hours','Extra time for complex skills',               90, 12500, 2, true),
  ('auto_120', 'Automatic Driving Lesson — 2 hours',  'Extended session for comprehensive practice',120, 16500, 3, true),
  ('manual_60',  'Manual Driving Lesson — 1 hour',    'Manual transmission lesson', 60,  8500, 4, false),
  ('manual_90',  'Manual Driving Lesson — 1.5 hours', 'Manual transmission lesson', 90, 12500, 5, false),
  ('manual_120', 'Manual Driving Lesson — 2 hours',    'Manual transmission lesson',120, 16500, 6, false),
  ('senior_auto_60','Senior Automatic Driving Lesson — 1 hour','For senior drivers focusing on safety and confidence',60, 7500, 7, true),
  ('senior_manual_60', 'Senior Manual Driving Lesson — 1 hour', 'Senior manual lesson', 60, 7500, 8, false)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    duration_minutes = EXCLUDED.duration_minutes,
    price_cents = EXCLUDED.price_cents,
    sort_order = EXCLUDED.sort_order,
    is_active  = EXCLUDED.is_active;

-- ================= MAPPER =================
CREATE OR REPLACE FUNCTION map_service_code(p_summary TEXT, p_minutes INT)
RETURNS TEXT AS $$
DECLARE
  v_is_senior BOOLEAN := false;
  v_is_manual BOOLEAN := false;
  v_is_auto   BOOLEAN := false;
  v_mins INT := p_minutes;
  v_num  TEXT;
BEGIN
  v_is_senior := p_summary ILIKE '%senior%';
  v_is_manual := p_summary ILIKE '%manual%';
  v_is_auto   := p_summary ILIKE '%automatic%' OR (NOT v_is_manual);

  IF v_mins IS NULL OR v_mins <= 0 THEN
    SELECT (regexp_matches(p_summary, '(\d+(?:\.\d+)?)', 'i'))[1] INTO v_num;
    IF v_num IS NOT NULL THEN
      v_mins := CEIL((v_num)::numeric * 60)::int;
    END IF;
  END IF;

  IF v_mins IS NULL THEN
    RETURN NULL;
  ELSIF v_mins BETWEEN 1 AND 70 THEN
    v_mins := 60;
  ELSIF v_mins BETWEEN 71 AND 105 THEN
    v_mins := 90;
  ELSE
    v_mins := 120;
  END IF;

  IF v_is_senior AND v_is_manual THEN
    RETURN format('senior_manual_%s', v_mins);
  ELSIF v_is_senior THEN
    RETURN format('senior_auto_%s', v_mins);
  ELSIF v_is_manual THEN
    RETURN format('manual_%s', v_mins);
  ELSE
    RETURN format('auto_%s', v_mins);
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ================= CONTACT & PROGRESS TABLES =================
CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at DESC);

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

-- ================= GOOGLE CALENDAR SYNC & WEBHOOKS =================
-- Watches + sync state per calendar
CREATE TABLE IF NOT EXISTS public.gcal_state (
  calendar_id text primary key,
  sync_token text,
  last_history_id text,
  channel_id text,
  resource_id text,
  channel_expiration timestamptz,
  updated_at timestamptz not null default now()
);

-- Webhook audit
CREATE TABLE IF NOT EXISTS public.gcal_webhook_log (
  id bigserial primary key,
  received_at timestamptz not null default now(),
  calendar_id text,
  channel_id text,
  resource_id text,
  resource_state text,
  message_number text,
  processed bool default false
);

-- De-dupe retry protection
CREATE UNIQUE INDEX IF NOT EXISTS gcal_webhook_log_dedupe
  ON public.gcal_webhook_log (channel_id, message_number)
  WHERE message_number is not null;

-- SMS queue with de-dupe
CREATE TABLE IF NOT EXISTS public.sms_queue (
  id bigserial primary key,
  phone text not null,
  body text not null,
  send_after timestamptz not null default now(),
  dedupe_key text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS sms_queue_dedupe_idx 
  ON public.sms_queue(dedupe_key);

-- Sync log for tracking sync operations
CREATE TABLE IF NOT EXISTS public.gcal_sync_log (
  id bigserial primary key,
  calendar_id text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running', -- running, success, failed
  synced_count integer default 0,
  inserted_count integer default 0,
  updated_count integer default 0,
  error_message text
);

-- Event-level sync log
CREATE TABLE IF NOT EXISTS public.gcal_sync_event_log (
  id bigserial primary key,
  sync_log_id int references gcal_sync_log(id) on delete cascade,
  calendar_id text,
  event_id text,
  booking_id uuid,
  action text check (action in ('inserted', 'updated', 'skipped', 'failed')),
  message text,
  created_at timestamptz default now()
);

-- Helper function to log event actions
CREATE OR REPLACE FUNCTION log_gcal_event_action(
  p_sync_log_id int,
  p_calendar_id text,
  p_event_id text,
  p_booking_id uuid,
  p_action text,
  p_message text default null
)
RETURNS void AS $$
BEGIN
  INSERT INTO gcal_sync_event_log (
    sync_log_id, calendar_id, event_id, booking_id, action, message
  )
  VALUES (p_sync_log_id, p_calendar_id, p_event_id, p_booking_id, p_action, p_message);
END;
$$ LANGUAGE plpgsql;

-- ================= UPSERT FROM GOOGLE =================
CREATE OR REPLACE FUNCTION public.upsert_booking_from_google(p_google_event_id text, p_calendar_id text, p_client_email text, p_first_name text, p_last_name text, p_mobile text, p_service_code text, p_price_cents integer, p_start timestamp with time zone, p_end timestamp with time zone, p_pickup text, p_extended jsonb, p_is_booking boolean, p_title text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_client_id UUID;
  v_booking_id UUID;
BEGIN
  -- Upsert client (only if email is provided)
  IF p_client_email IS NOT NULL THEN
    INSERT INTO client (email, first_name, last_name, mobile)
    VALUES (p_client_email, p_first_name, p_last_name, p_mobile)
    ON CONFLICT (email) DO UPDATE
      SET first_name = COALESCE(EXCLUDED.first_name, client.first_name),
          last_name  = COALESCE(EXCLUDED.last_name,  client.last_name),
          mobile     = COALESCE(EXCLUDED.mobile,     client.mobile),
          updated_at = NOW()
    RETURNING id INTO v_client_id;
  END IF;

  -- Upsert booking (NOW INCLUDING first_name, last_name, email, mobile)
  INSERT INTO booking (
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
    SET client_id          = COALESCE(EXCLUDED.client_id, booking.client_id),
        google_calendar_id = EXCLUDED.google_calendar_id,
        is_booking         = COALESCE(EXCLUDED.is_booking, booking.is_booking),
        service_code       = EXCLUDED.service_code,
        price_cents        = EXCLUDED.price_cents,
        start_time         = EXCLUDED.start_time,
        end_time           = EXCLUDED.end_time,
        pickup_location    = COALESCE(EXCLUDED.pickup_location, booking.pickup_location),
        extended           = COALESCE(booking.extended, '{}'::jsonb) || COALESCE(EXCLUDED.extended, '{}'::jsonb),
        event_title        = COALESCE(EXCLUDED.event_title, booking.event_title),
        first_name         = COALESCE(EXCLUDED.first_name, booking.first_name),
        last_name          = COALESCE(EXCLUDED.last_name, booking.last_name),
        email              = COALESCE(EXCLUDED.email, booking.email),
        mobile             = COALESCE(EXCLUDED.mobile, booking.mobile),
        updated_at         = NOW()
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$function$


