-- Run once in Supabase → SQL Editor. Contains 4 migrations in order (all safe to re-run).

-- ===== 20261115140000_user_reports.sql =====
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

-- ===== 20261115150000_count_call_sessions.sql =====
-- =====================================================================
-- HUMI — session count follows real calls
-- Before: host_profiles.total_sessions only grew when a booking was marked
-- "completed" (old fixed-price model), so per-minute calls never counted.
-- Now: every call that actually happened (time was billed) counts once,
-- when it ends. Old completed bookings without a call still count.
-- Safe to run more than once.
-- =====================================================================

-- Bookings no longer increment the counter (a booking leads to a call, which is what counts).
create or replace function public.bookings_after_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  return new;
end $$;

create or replace function public.call_sessions_count_session()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'ended' and old.status is distinct from 'ended' and new.billed_seconds > 0 then
    update public.host_profiles set total_sessions = total_sessions + 1 where id = new.host_id;
  end if;
  return new;
end $$;

drop trigger if exists call_sessions_count_session on public.call_sessions;
create trigger call_sessions_count_session after update of status on public.call_sessions
  for each row execute function public.call_sessions_count_session();

revoke execute on function public.call_sessions_count_session() from public, anon, authenticated;

-- Recount everything already in the database.
update public.host_profiles hp set total_sessions =
    (select count(*) from public.call_sessions c where c.host_id = hp.id and c.status = 'ended' and c.billed_seconds > 0)
  + (select count(*) from public.bookings b where b.host_id = hp.id and b.status = 'completed'
       and not exists (select 1 from public.call_sessions c where c.booking_id = b.id and c.billed_seconds > 0));

-- ===== 20261115160000_call_ratings.sql =====
-- =====================================================================
-- HUMI · Rate the other person at the end of a call
--   * Guest → host: a normal public review (counts in the host's rating).
--   * Host → guest: a private rating, visible only to the host who wrote it and to admins.
-- Only real calls (ended, with billed time) can be rated, once each (it can be edited).
-- Safe to run more than once.
-- =====================================================================

-- Reviews can now come from a booking OR a call.
alter table public.reviews alter column booking_id drop not null;
alter table public.reviews add column if not exists call_id uuid unique references public.call_sessions (id) on delete cascade;
alter table public.reviews drop constraint if exists reviews_one_source;
alter table public.reviews add constraint reviews_one_source check ((booking_id is null) <> (call_id is null));

create or replace function public.reviews_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_booking public.bookings; v_call public.call_sessions;
begin
  if new.booking_id is not null then
    select * into v_booking from public.bookings where id = new.booking_id;
    if not found or v_booking.status <> 'completed' or v_booking.customer_id <> new.customer_id then
      raise exception 'You can only review your own completed sessions.' using errcode = '42501';
    end if;
    new.host_id := v_booking.host_id; -- never trust the client's host_id
  else
    select * into v_call from public.call_sessions where id = new.call_id;
    if not found or v_call.status <> 'ended' or v_call.billed_seconds <= 0 or v_call.customer_id <> new.customer_id then
      raise exception 'You can only review your own completed calls.' using errcode = '42501';
    end if;
    new.host_id := v_call.host_id;
  end if;
  return new;
end $$;

drop trigger if exists reviews_before_write on public.reviews;
create trigger reviews_before_write before insert or update of booking_id, call_id, customer_id, host_id on public.reviews
  for each row execute function public.reviews_before_write();

-- Host → guest ratings (private).
create table if not exists public.guest_ratings (
  id           uuid primary key default gen_random_uuid(),
  call_id      uuid not null unique references public.call_sessions (id) on delete cascade,
  host_id      uuid not null references public.host_profiles (id) on delete cascade,
  customer_id  uuid not null references public.profiles (id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  comment      text check (char_length(comment) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists guest_ratings_customer_idx on public.guest_ratings (customer_id);
alter table public.guest_ratings enable row level security;

drop policy if exists "guest_ratings: author or admin reads" on public.guest_ratings;
create policy "guest_ratings: author or admin reads" on public.guest_ratings for select to authenticated
  using (public.is_admin() or exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));
revoke all on public.guest_ratings from anon;
revoke insert, update, delete on public.guest_ratings from authenticated;

-- One entry point for both sides. Returns 'host' or 'guest' (who was rated).
create or replace function public.rate_call(p_call_id uuid, p_rating integer, p_comment text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_call public.call_sessions;
  v_host_user uuid;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then raise exception 'Please log in.' using errcode = '42501'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose 1 to 5 stars.' using errcode = 'P0001'; end if;
  if char_length(v_comment) > 1000 then raise exception 'Comment is too long.' using errcode = 'P0001'; end if;

  select * into v_call from public.call_sessions where id = p_call_id;
  if not found then raise exception 'Call not found.' using errcode = 'P0002'; end if;
  select user_id into v_host_user from public.host_profiles where id = v_call.host_id;

  if v_uid <> v_call.customer_id and v_uid is distinct from v_host_user then
    raise exception 'You were not in this call.' using errcode = '42501';
  end if;
  if v_call.status <> 'ended' or v_call.billed_seconds <= 0 then
    raise exception 'Only completed calls can be rated.' using errcode = 'P0001';
  end if;

  if v_uid = v_call.customer_id then
    insert into public.reviews (call_id, customer_id, host_id, rating, comment)
    values (p_call_id, v_uid, v_call.host_id, p_rating, v_comment)
    on conflict (call_id) do update set rating = excluded.rating, comment = excluded.comment;
    return 'host';
  end if;

  insert into public.guest_ratings (call_id, host_id, customer_id, rating, comment)
  values (p_call_id, v_call.host_id, v_call.customer_id, p_rating, v_comment)
  on conflict (call_id) do update set rating = excluded.rating, comment = excluded.comment, updated_at = now();
  return 'guest';
end $$;

-- Your own rating for a call (null if you haven't rated it yet).
create or replace function public.my_call_rating(p_call_id uuid)
returns table (rating smallint, comment text) language sql stable security definer set search_path = '' as $$
  select r.rating, r.comment from public.reviews r where r.call_id = p_call_id and r.customer_id = auth.uid()
  union all
  select g.rating, g.comment from public.guest_ratings g
  join public.host_profiles hp on hp.id = g.host_id
  where g.call_id = p_call_id and hp.user_id = auth.uid()
  limit 1;
$$;

revoke execute on function public.rate_call(uuid, integer, text), public.my_call_rating(uuid) from public, anon;
grant execute on function public.rate_call(uuid, integer, text), public.my_call_rating(uuid) to authenticated;

-- Make the API see the new functions right away.
notify pgrst, 'reload schema';

-- ===== 20261115170000_mercadopago_topups.sql =====
-- =====================================================================
-- HUMI · Mercado Pago top-ups
-- Top-ups from the Mercado Pago SANDBOX (test credentials) must be test balance, not real money.
-- Before: livemode = provider <> 'test'. Now: real money only for real providers.
-- Safe to run more than once.
-- =====================================================================
create or replace function public.create_topup(p_amount_cents bigint, p_provider text, p_method text)
returns public.wallet_topups language plpgsql security definer set search_path = '' as $$
declare v public.wallet_topups;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_provider not in ('test', 'mercadopago', 'mercadopago_sandbox') then
    raise exception 'Unknown payment provider.' using errcode = 'P0001';
  end if;
  if p_amount_cents < public.setting('topup_min_cents') or p_amount_cents > public.setting('topup_max_cents') then
    raise exception 'Top-up must be between % and % cents.', public.setting('topup_min_cents'), public.setting('topup_max_cents')
      using errcode = 'P0001', hint = 'topup_out_of_range';
  end if;
  insert into public.wallets (user_id) values (auth.uid()) on conflict do nothing;
  insert into public.wallet_topups (user_id, amount_cents, provider, method, livemode)
  values (auth.uid(), p_amount_cents, p_provider, p_method, p_provider = 'mercadopago')
  returning * into v;
  return v;
end $$;

notify pgrst, 'reload schema';
