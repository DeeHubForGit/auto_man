-- Migration: Add test and notification fields (Phase 1)
-- Date: 2026-03-07
-- Description: Add is_test to client and booking tables, add notification flags to booking table

-- Add is_test to client table
alter table public.client
add column is_test boolean not null default false;

-- Add test and notification fields to booking table
alter table public.booking
add column is_test boolean not null default false;

alter table public.booking
add column is_sms_enabled boolean not null default true;

alter table public.booking
add column is_email_enabled boolean not null default true;

alter table public.booking
add column sms_new_booking_sent_at timestamp with time zone null;

-- Create indexes for filtering test data
create index if not exists idx_client_is_test on public.client (is_test);
create index if not exists idx_booking_is_test on public.booking (is_test);

-- Backfill existing bookings from linked clients
update public.booking b
set is_test = c.is_test
from public.client c
where b.client_id = c.id;

-- Backfill booking notification flags from is_test
update public.booking
set
  is_sms_enabled = case when is_test then false else true end,
  is_email_enabled = case when is_test then false else true end;

-- Optional: Mark known test clients (uncomment if confirmed correct)
update public.client
set is_test = true
where email in ('dee.bath76@gmail.com', 'dee_bath@hotmail.com');
