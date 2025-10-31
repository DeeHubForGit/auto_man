-- Admin detector
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(auth.jwt()->>'email','') in ('darren@automandrivingschool.com.au');
$$;

-- Enable RLS
alter table public.client           enable row level security;
alter table public.booking          enable row level security;
alter table public.contact_messages enable row level security;
alter table public.client_progress  enable row level security;
alter table public.sms_log          enable row level security;
alter table public.email_log        enable row level security;
alter table public.gcal_state       enable row level security;
alter table public.gcal_sync_log    enable row level security;
alter table public.gcal_webhook_log enable row level security;

-- ===== CLIENT =====
drop policy if exists client_select on public.client;
drop policy if exists client_update on public.client;
drop policy if exists client_insert on public.client;

-- Self or admin can read
create policy client_select on public.client
for select to authenticated
using ( is_admin() or email = coalesce(auth.jwt()->>'email','') );

-- Self or admin can update
create policy client_update on public.client
for update to authenticated
using ( is_admin() or email = coalesce(auth.jwt()->>'email','') )
with check ( is_admin() or email = coalesce(auth.jwt()->>'email','') );

-- INSERT: Users can create their OWN record (email matches auth), service role, or admin
create policy client_insert on public.client
for insert to authenticated, anon
with check ( 
  auth.role() = 'service_role' 
  or is_admin() 
  or email = coalesce(auth.jwt()->>'email','')
);

-- ===== BOOKING =====
drop policy if exists booking_select on public.booking;
drop policy if exists booking_mutate on public.booking;

-- Read own bookings (via client.email) or admin
create policy booking_select on public.booking
for select to authenticated
using (
  is_admin() or client_id in (
    select id from public.client
    where email = coalesce(auth.jwt()->>'email','')
  )
);

-- Insert/Update/Delete by service role or admin
create policy booking_mutate on public.booking
for all to authenticated, anon
using ( auth.role() = 'service_role' or is_admin() )
with check ( auth.role() = 'service_role' or is_admin() );

-- ===== CONTACT MESSAGES =====
drop policy if exists contact_messages_insert on public.contact_messages;
drop policy if exists contact_messages_select on public.contact_messages;

-- Public website can insert messages (anon users allowed)
create policy contact_messages_insert on public.contact_messages
for insert to authenticated, anon
with check ( true );

-- Only admin can read messages
create policy contact_messages_select on public.contact_messages
for select to authenticated
using ( is_admin() );

-- ===== CLIENT PROGRESS =====
drop policy if exists client_progress_all on public.client_progress;
create policy client_progress_all on public.client_progress
for all to authenticated, anon
using ( auth.role() = 'service_role' or is_admin() )
with check ( auth.role() = 'service_role' or is_admin() );

-- ===== LOG/STATE TABLES =====
do $$
declare t text;
begin
  foreach t in array array['sms_log','email_log','gcal_state','gcal_sync_log','gcal_webhook_log']
  loop
    execute format('drop policy if exists %I_read on public.%I;', t||'_read', t);
    execute format('drop policy if exists %I_write on public.%I;', t||'_write', t);

    execute format($f$
      create policy %1$I_read on public.%2$I
      for select to authenticated
      using ( is_admin() );
    $f$, t||'_read', t);

    execute format($f$
      create policy %1$I_write on public.%2$I
      for all to authenticated, anon
      using ( auth.role() = 'service_role' or is_admin() )
      with check ( auth.role() = 'service_role' or is_admin() );
    $f$, t||'_write', t);
  end loop;
end$$;
