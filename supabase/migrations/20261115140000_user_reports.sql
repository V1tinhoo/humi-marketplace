-- =====================================================================
-- HUMI — reporting users (in a call, after a call, from a profile or a booking)
-- Reporters never need the other person's user id: the server resolves who
-- the other side is from the call / booking / host profile.
-- Reports are private: the reporter sees their own; admins see all.
-- Safe to run more than once.
-- =====================================================================

-- Fix from 20261115130000: visitors (anon) got "permission denied for function is_admin"
-- when reading public settings. Separate policies: anon never calls is_admin().
drop policy if exists "settings: public read (no commission)" on public.platform_settings;
drop policy if exists "settings: anon read (no commission)" on public.platform_settings;
drop policy if exists "settings: signed-in read (no commission)" on public.platform_settings;
create policy "settings: anon read (no commission)" on public.platform_settings for select to anon
  using (key <> 'commission_bps');
create policy "settings: signed-in read (no commission)" on public.platform_settings for select to authenticated
  using (key <> 'commission_bps' or public.is_admin());

do $$ begin
  create type public.report_reason as enum (
    'harassment', 'inappropriate_content', 'sexual_content', 'hate_speech',
    'spam_or_scam', 'off_platform_payment', 'underage', 'safety_concern', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('open', 'reviewing', 'action_taken', 'dismissed');
exception when duplicate_object then null; end $$;

create table if not exists public.user_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references public.profiles (id) on delete cascade,
  reported_user_id  uuid not null references public.profiles (id) on delete cascade,
  call_id           uuid references public.call_sessions (id) on delete set null,
  booking_id        uuid references public.bookings (id) on delete set null,
  host_profile_id   uuid references public.host_profiles (id) on delete set null,
  context           text not null check (context in ('call', 'booking', 'profile')),
  reason            public.report_reason not null,
  details           text check (char_length(details) <= 1000),
  status            public.report_status not null default 'open',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint user_reports_not_self check (reporter_id <> reported_user_id)
);
create index if not exists user_reports_reported_idx on public.user_reports (reported_user_id, created_at desc);
create index if not exists user_reports_status_idx on public.user_reports (status, created_at desc);
create index if not exists user_reports_reporter_idx on public.user_reports (reporter_id, created_at desc);

alter table public.user_reports enable row level security;
drop policy if exists "reports: own or admin" on public.user_reports;
create policy "reports: own or admin" on public.user_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.user_reports from anon, authenticated;
revoke all on public.user_reports from anon;

-- Exactly one of call / booking / host must be given.
create or replace function public.report_user(
  p_reason public.report_reason,
  p_details text default null,
  p_call_id uuid default null,
  p_booking_id uuid default null,
  p_host_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_context text;
  v_host_user uuid;
  v_customer uuid;
  v_host_profile uuid;
  v_existing uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Please log in to report.' using errcode = '42501'; end if;
  if (p_call_id is not null)::int + (p_booking_id is not null)::int + (p_host_id is not null)::int <> 1 then
    raise exception 'Report one call, booking or profile at a time.' using errcode = 'P0001';
  end if;

  if p_call_id is not null then
    select cs.customer_id, hp.user_id, hp.id into v_customer, v_host_user, v_host_profile
    from public.call_sessions cs join public.host_profiles hp on hp.id = cs.host_id where cs.id = p_call_id;
    v_context := 'call';
  elsif p_booking_id is not null then
    select b.customer_id, hp.user_id, hp.id into v_customer, v_host_user, v_host_profile
    from public.bookings b join public.host_profiles hp on hp.id = b.host_id where b.id = p_booking_id;
    v_context := 'booking';
  else
    select hp.user_id, hp.id into v_host_user, v_host_profile from public.host_profiles hp where hp.id = p_host_id;
    v_context := 'profile';
  end if;

  if v_host_user is null then raise exception 'Not found.' using errcode = 'P0001'; end if;

  if v_context = 'profile' then
    if v_host_user = v_uid then raise exception 'You can''t report yourself.' using errcode = 'P0001'; end if;
    v_target := v_host_user;
  elsif v_uid = v_customer then
    v_target := v_host_user;          -- customer reports the host
  elsif v_uid = v_host_user then
    v_target := v_customer;           -- host reports the customer
  else
    raise exception 'You can only report people you talked to.' using errcode = '42501';
  end if;

  -- Same report again within 10 minutes: keep the first one (double clicks, retries).
  select id into v_existing from public.user_reports
   where reporter_id = v_uid and reported_user_id = v_target and created_at > now() - interval '10 minutes'
     and coalesce(call_id, booking_id, host_profile_id) is not distinct from coalesce(p_call_id, p_booking_id, v_host_profile)
   limit 1;
  if v_existing is not null then return v_existing; end if;

  -- Abuse limit.
  if (select count(*) from public.user_reports where reporter_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve sent many reports today. Please contact support if it''s urgent.' using errcode = 'P0001';
  end if;

  insert into public.user_reports (reporter_id, reported_user_id, call_id, booking_id, host_profile_id, context, reason, details)
  values (v_uid, v_target, p_call_id, p_booking_id, v_host_profile, v_context, p_reason, nullif(left(trim(coalesce(p_details, '')), 1000), ''))
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.report_user(public.report_reason, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.report_user(public.report_reason, text, uuid, uuid, uuid) to authenticated;
