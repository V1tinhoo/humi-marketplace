-- =====================================================================
-- HUMI · Minute packages and monthly renewal (like lesson packages)
--
-- A customer buys a package of minutes with ONE host (audio or video), paid
-- from the wallet with a fixed site discount:
--     60 min −5% · 120 min −10% · 300 min −15%   (editable in admin settings)
-- * Calls with that host use the package first; when it runs out, the call
--   continues on the wallet at the normal price.
-- * The host earns as minutes are used (80% after the HUMI commission), with the
--   normal holding period — never on unused minutes.
-- * Valid for 90 days. Unused minutes go back to the wallet (at the price paid)
--   when the package expires or if the customer cancels it.
-- * Monthly renewal ("subscription"): every 30 days the same package is bought
--   again from the wallet. If there isn't enough balance, the renewal stops and
--   the customer sees why. Cancel any time.
-- Safe to run more than once.
-- =====================================================================

insert into public.platform_settings (key, value, description) values
  ('package_1_minutes',      60,   'Package tier 1: minutes.'),
  ('package_1_discount_bps', 500,  'Package tier 1: discount in basis points (500 = 5%).'),
  ('package_2_minutes',      120,  'Package tier 2: minutes.'),
  ('package_2_discount_bps', 1000, 'Package tier 2: discount (1000 = 10%).'),
  ('package_3_minutes',      300,  'Package tier 3: minutes.'),
  ('package_3_discount_bps', 1500, 'Package tier 3: discount (1500 = 15%).'),
  ('package_validity_days',  90,   'Days a package is valid; unused minutes then go back to the wallet.'),
  ('package_renewal_days',   30,   'Days between automatic renewals of a package subscription.')
on conflict (key) do nothing;

create table if not exists public.package_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.profiles (id) on delete cascade,
  host_id          uuid not null references public.host_profiles (id) on delete cascade,
  call_type        public.call_type not null,
  tier             smallint not null check (tier between 1 and 3),
  active           boolean not null default true,
  next_renewal_at  timestamptz not null,
  last_package_id  uuid,
  stopped_reason   text,          -- 'cancelled' | 'insufficient_balance' | 'host_unavailable'
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists package_subscriptions_one_active on public.package_subscriptions (customer_id, host_id, call_type) where active;

create table if not exists public.minute_packages (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid not null references public.profiles (id) on delete restrict,
  host_id                 uuid not null references public.host_profiles (id) on delete restrict,
  call_type               public.call_type not null,
  tier                    smallint not null check (tier between 1 and 3),
  minutes                 integer not null check (minutes > 0),
  price_cents_per_minute  integer not null check (price_cents_per_minute > 0),   -- host price when bought
  discount_bps            integer not null check (discount_bps between 0 and 9000),
  paid_cents              bigint not null check (paid_cents > 0),
  seconds_total           integer not null check (seconds_total > 0),
  seconds_used            integer not null default 0,
  used_cents              bigint not null default 0,   -- value of the minutes used = floor(paid × used / total)
  refunded_cents          bigint not null default 0,
  livemode                boolean not null,
  status                  text not null default 'active' check (status in ('active', 'used', 'expired', 'cancelled')),
  expires_at              timestamptz not null,
  subscription_id         uuid references public.package_subscriptions (id) on delete set null,
  created_at              timestamptz not null default now(),
  closed_at               timestamptz,
  check (seconds_used between 0 and seconds_total),
  check (used_cents + refunded_cents <= paid_cents)
);
create index if not exists minute_packages_customer_idx on public.minute_packages (customer_id, status, expires_at);
create index if not exists minute_packages_host_idx on public.minute_packages (host_id, status);

alter table public.call_sessions add column if not exists package_id uuid references public.minute_packages (id) on delete restrict;
alter table public.call_sessions add column if not exists package_seconds integer not null default 0;
alter table public.call_sessions add column if not exists package_cents bigint not null default 0;

alter table public.minute_packages enable row level security;
alter table public.package_subscriptions enable row level security;
drop policy if exists "packages: customer, host or admin" on public.minute_packages;
drop policy if exists "package subs: customer or admin" on public.package_subscriptions;
create policy "packages: customer, host or admin" on public.minute_packages for select to authenticated
  using (customer_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));
create policy "package subs: customer or admin" on public.package_subscriptions for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());
revoke all on public.minute_packages, public.package_subscriptions from anon, authenticated;
grant select on public.minute_packages, public.package_subscriptions to authenticated;
-- No write grants: only the functions below change packages.

-- ---------------------------------------------------------------------
-- Offers (public): the three tiers for a host, per call type
-- ---------------------------------------------------------------------
create or replace function public.package_offers(p_host uuid)
returns table (tier smallint, minutes integer, call_type public.call_type, price_cents_per_minute integer,
               discount_bps integer, total_cents bigint, full_price_cents bigint, validity_days integer)
language sql stable security definer set search_path = '' as $$
  with h as (
    select hp.id, hp.call_types, pr.audio_cents_per_minute a, coalesce(pr.video_cents_per_minute, pr.audio_cents_per_minute) v
    from public.host_profiles hp join public.host_pricing pr on pr.host_id = hp.id
    where hp.id = p_host and hp.is_published
  ), tiers(t) as (values (1::smallint), (2::smallint), (3::smallint)),
  types(ct) as (select unnest(h.call_types) from h)
  select t.t,
         public.setting('package_' || t.t || '_minutes')::integer,
         types.ct,
         case when types.ct = 'video' then h.v else h.a end,
         public.setting('package_' || t.t || '_discount_bps')::integer,
         floor((case when types.ct = 'video' then h.v else h.a end)::numeric * public.setting('package_' || t.t || '_minutes')
               * (10000 - public.setting('package_' || t.t || '_discount_bps')) / 10000)::bigint,
         ((case when types.ct = 'video' then h.v else h.a end)::bigint * public.setting('package_' || t.t || '_minutes')),
         public.setting('package_validity_days')::integer
  from h cross join tiers t cross join types
  where public.setting('package_' || t.t || '_minutes') > 0
  order by types.ct, t.t
$$;

-- ---------------------------------------------------------------------
-- Buying (internal helper used by purchase and renewal)
-- ---------------------------------------------------------------------
create or replace function public.create_minute_package(p_customer uuid, p_host uuid, p_call_type public.call_type, p_tier smallint, p_subscription uuid)
returns public.minute_packages language plpgsql security definer set search_path = '' as $$
declare
  o record;
  v_balance bigint;
  v_test bigint;
  v_live boolean;
  v public.minute_packages;
  v_id uuid := gen_random_uuid();
begin
  select * into o from public.package_offers(p_host) x where x.tier = p_tier and x.call_type = p_call_type;
  if o.tier is null then raise exception 'This package isn''t available for this host.' using errcode = 'P0001', hint = 'package_unavailable'; end if;
  if exists (select 1 from public.profiles where id = p_customer and suspended_at is not null) then
    raise exception 'Your account is suspended. Contact support.' using errcode = 'P0001', hint = 'suspended';
  end if;
  if exists (select 1 from public.host_profiles where id = p_host and user_id = p_customer) then
    raise exception 'You can''t buy a package with yourself.' using errcode = 'P0001';
  end if;
  if public.users_blocked(p_customer, (select user_id from public.host_profiles where id = p_host)) then
    raise exception 'This package isn''t available for this host.' using errcode = 'P0001', hint = 'package_unavailable';
  end if;

  insert into public.wallets (user_id) values (p_customer) on conflict do nothing;
  select balance_cents, test_balance_cents into v_balance, v_test from public.wallets where user_id = p_customer;
  if v_balance >= o.total_cents then
    v_live := true;
  elsif coalesce(public.setting('allow_test_calls'), 0) = 1 and v_test >= o.total_cents then
    v_live := false;
  else
    raise exception 'Add at least % cents to buy this package.', o.total_cents - v_balance using errcode = 'P0001', hint = 'insufficient_balance';
  end if;

  perform public.wallet_apply(p_customer, 'adjustment', -o.total_cents, v_id, 'package:' || v_id, v_live, 'Minute package');
  insert into public.minute_packages (id, customer_id, host_id, call_type, tier, minutes, price_cents_per_minute, discount_bps,
                                      paid_cents, seconds_total, livemode, expires_at, subscription_id)
  values (v_id, p_customer, p_host, p_call_type, p_tier, o.minutes, o.price_cents_per_minute, o.discount_bps,
          o.total_cents, o.minutes * 60, v_live, now() + make_interval(days => o.validity_days), p_subscription)
  returning * into v;
  return v;
end $$;

create or replace function public.buy_package(p_host uuid, p_call_type public.call_type, p_tier integer, p_renew_monthly boolean default false)
returns public.minute_packages language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v public.minute_packages; v_sub uuid;
begin
  if v_uid is null then raise exception 'Please log in.' using errcode = '42501'; end if;
  if p_tier not between 1 and 3 then raise exception 'Choose a package.' using errcode = 'P0001'; end if;
  if p_renew_monthly then
    if exists (select 1 from public.package_subscriptions where customer_id = v_uid and host_id = p_host and call_type = p_call_type and active) then
      raise exception 'You already renew a package with this host every month.' using errcode = 'P0001';
    end if;
    insert into public.package_subscriptions (customer_id, host_id, call_type, tier, next_renewal_at)
    values (v_uid, p_host, p_call_type, p_tier, now() + make_interval(days => public.setting('package_renewal_days')::int))
    returning id into v_sub;
  end if;
  v := public.create_minute_package(v_uid, p_host, p_call_type, p_tier::smallint, v_sub);
  if v_sub is not null then update public.package_subscriptions set last_package_id = v.id where id = v_sub; end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Closing a package: unused value goes back to the wallet
-- ---------------------------------------------------------------------
create or replace function public.close_minute_package(p_id uuid, p_status text)
returns public.minute_packages language plpgsql security definer set search_path = '' as $$
declare p public.minute_packages; v_refund bigint;
begin
  select * into p from public.minute_packages where id = p_id for update;
  if p.status <> 'active' then return p; end if;
  v_refund := p.paid_cents - p.used_cents;
  if v_refund > 0 then
    perform public.wallet_apply(p.customer_id, 'refund', v_refund, p.id, 'package-return:' || p.id, p.livemode,
      case when p_status = 'expired' then 'Unused package minutes returned (expired)' else 'Unused package minutes returned' end);
  end if;
  update public.minute_packages set status = p_status, refunded_cents = v_refund, closed_at = now() where id = p.id returning * into p;
  return p;
end $$;

create or replace function public.cancel_package(p_id uuid)
returns public.minute_packages language plpgsql security definer set search_path = '' as $$
declare p public.minute_packages;
begin
  select * into p from public.minute_packages where id = p_id and customer_id = auth.uid();
  if not found then raise exception 'Package not found.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.call_sessions where package_id = p_id and status in ('ringing', 'connected')) then
    raise exception 'Finish the call before cancelling the package.' using errcode = 'P0001';
  end if;
  return public.close_minute_package(p_id, 'cancelled');
end $$;

create or replace function public.set_package_renewal(p_subscription uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_active then
    update public.package_subscriptions s set active = true, stopped_reason = null, updated_at = now(),
           next_renewal_at = greatest(s.next_renewal_at, now())
     where id = p_subscription and customer_id = auth.uid()
       and not exists (select 1 from public.package_subscriptions o where o.customer_id = s.customer_id and o.host_id = s.host_id and o.call_type = s.call_type and o.active);
  else
    update public.package_subscriptions set active = false, stopped_reason = 'cancelled', updated_at = now()
     where id = p_subscription and customer_id = auth.uid();
  end if;
  if not found then raise exception 'Subscription not found.' using errcode = 'P0002'; end if;
end $$;

/**
 * Expires packages (unused value back to the wallet) and renews due subscriptions.
 * Called daily by the server (all customers) and whenever a customer opens their packages.
 */
create or replace function public.process_packages(p_customer uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; v_n integer := 0; v public.minute_packages;
begin
  for r in select id from public.minute_packages
           where status = 'active' and expires_at <= now() and (p_customer is null or customer_id = p_customer)
           and not exists (select 1 from public.call_sessions c where c.package_id = minute_packages.id and c.status in ('ringing', 'connected'))
  loop
    perform public.close_minute_package(r.id, 'expired');
    v_n := v_n + 1;
  end loop;

  for r in select * from public.package_subscriptions
           where active and next_renewal_at <= now() and (p_customer is null or customer_id = p_customer)
  loop
    begin
      v := public.create_minute_package(r.customer_id, r.host_id, r.call_type, r.tier, r.id);
      update public.package_subscriptions
         set last_package_id = v.id, updated_at = now(),
             next_renewal_at = r.next_renewal_at + make_interval(days => public.setting('package_renewal_days')::int)
       where id = r.id;
      v_n := v_n + 1;
    exception when others then
      update public.package_subscriptions
         set active = false, updated_at = now(),
             stopped_reason = case when sqlerrm like 'Add at least%' then 'insufficient_balance' else 'host_unavailable' end
       where id = r.id;
    end;
  end loop;
  return v_n;
end $$;

/** The customer's packages (processes expiries/renewals first). */
create or replace function public.my_packages()
returns table (
  id uuid, host_id uuid, host_name text, host_photo text, call_type public.call_type, tier smallint, minutes integer,
  seconds_total integer, seconds_used integer, paid_cents bigint, used_cents bigint, refunded_cents bigint,
  discount_bps integer, status text, expires_at timestamptz, created_at timestamptz, livemode boolean,
  subscription_id uuid, renews boolean, next_renewal_at timestamptz, renewal_stopped_reason text
) language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '42501'; end if;
  perform public.process_packages(auth.uid());
  return query
    select p.id, p.host_id, hp.display_name, pr.avatar_url, p.call_type, p.tier, p.minutes, p.seconds_total, p.seconds_used,
           p.paid_cents, p.used_cents, p.refunded_cents, p.discount_bps, p.status, p.expires_at, p.created_at, p.livemode,
           s.id, coalesce(s.active, false), s.next_renewal_at, s.stopped_reason
    from public.minute_packages p
    join public.host_profiles hp on hp.id = p.host_id
    join public.profiles pr on pr.id = hp.user_id
    left join public.package_subscriptions s on s.id = p.subscription_id
    where p.customer_id = auth.uid()
    order by (p.status = 'active') desc, p.created_at desc
    limit 100;
end $$;

/** Seconds left on the package a call is using (for the call screen's meter). */
create or replace function public.call_package_left(p_call uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select greatest(p.seconds_total - p.seconds_used, 0)
                   from public.call_sessions c join public.minute_packages p on p.id = c.package_id
                   where c.id = p_call and c.customer_id = auth.uid() and p.status = 'active'), 0)
$$;

-- ---------------------------------------------------------------------
-- Calls: use the package first, then the wallet
-- ---------------------------------------------------------------------
create or replace function public.start_call(p_host_id uuid, p_call_type public.call_type, p_booking_id uuid default null)
returns public.call_sessions language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_host public.host_profiles;
  v_price integer;
  v_balance bigint;
  v_test bigint;
  v_live boolean;
  v_needed bigint;
  v public.call_sessions;
  v_pkg public.minute_packages;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into v_host from public.host_profiles where id = p_host_id;
  if not found or not v_host.is_published then raise exception 'This host is not available.' using errcode = 'P0001', hint = 'host_unavailable'; end if;
  if v_host.user_id = v_uid then raise exception 'You can''t call yourself.' using errcode = 'P0001', hint = 'self_call'; end if;
  if exists (select 1 from public.profiles where id = v_uid and suspended_at is not null) then
    raise exception 'Your account is suspended. Contact support.' using errcode = 'P0001', hint = 'suspended';
  end if;
  -- Blocked (either way): the host simply isn't available; nobody is told about the block.
  if public.users_blocked(v_uid, v_host.user_id) then
    raise exception 'This host is not available.' using errcode = 'P0001', hint = 'host_unavailable';
  end if;
  -- The host declined your last N calls in the past 24 h: wait before calling again.
  if public.declined_too_often(v_uid, p_host_id) then
    raise exception 'This host can''t take your calls right now. Please try again later.' using errcode = 'P0001', hint = 'declined_limit';
  end if;
  if not (p_call_type = any (v_host.call_types)) then raise exception 'This host doesn''t offer % calls.', p_call_type using errcode = 'P0001'; end if;
  if p_booking_id is not null and not exists (
    select 1 from public.bookings b where b.id = p_booking_id and b.customer_id = v_uid and b.host_id = p_host_id and b.status = 'confirmed'
  ) then raise exception 'Booking not found.' using errcode = 'P0001'; end if;

  select case when p_call_type = 'video' then coalesce(video_cents_per_minute, audio_cents_per_minute) else audio_cents_per_minute end
    into v_price from public.host_pricing where host_id = p_host_id;
  if v_price is null then raise exception 'This host has no price set.' using errcode = 'P0001'; end if;

  -- Close stale calls (nobody connected for longer than the grace period) so they don't block.
  update public.call_sessions set status = case when status = 'ringing' then 'failed'::public.call_status else 'ended'::public.call_status end,
         end_reason = case when status = 'ringing' then 'failed_to_connect' else 'dropped' end, ended_at = now()
   where (customer_id = v_uid or host_id = p_host_id) and status in ('ringing', 'connected')
     and coalesce(last_connected_at, created_at) < now() - make_interval(secs => greatest(public.setting('call_grace_seconds'), public.setting('call_ring_timeout_seconds')));

  insert into public.wallets (user_id) values (v_uid) on conflict do nothing;
  select balance_cents, test_balance_cents into v_balance, v_test from public.wallets where user_id = v_uid;
  v_needed := ceil(v_price * public.setting('call_min_start_seconds') / 60.0);

  -- A package with this host (same call type) pays the call first: no wallet balance needed.
  select * into v_pkg from public.minute_packages
   where customer_id = v_uid and host_id = p_host_id and call_type = p_call_type and status = 'active'
     and expires_at > now() and seconds_used < seconds_total
   order by expires_at limit 1;
  if v_pkg.id is not null then
    insert into public.call_sessions (booking_id, customer_id, host_id, call_type, price_cents_per_minute, commission_bps, room_name, livemode, package_id)
    values (p_booking_id, v_uid, p_host_id, p_call_type, v_price, public.setting('commission_bps'),
            'humi-' || replace(gen_random_uuid()::text, '-', ''), v_pkg.livemode, v_pkg.id)
    returning * into v;
    return v;
  end if;
  -- Real money first: the call is "live" only when paid with real balance.
  -- Test balance can only pay test calls (whose host earnings can never be paid out).
  if v_balance >= v_needed then
    v_live := true;
  elsif coalesce(public.setting('allow_test_calls'), 0) = 1 and v_test >= v_needed then
    v_live := false;
  else
    raise exception 'Add at least % cents to start this call.', v_needed - v_balance using errcode = 'P0001', hint = 'insufficient_balance';
  end if;

  insert into public.call_sessions (booking_id, customer_id, host_id, call_type, price_cents_per_minute, commission_bps, room_name, livemode)
  values (p_booking_id, v_uid, p_host_id, p_call_type, v_price, public.setting('commission_bps'),
          'humi-' || replace(gen_random_uuid()::text, '-', ''), v_live)
  returning * into v;
  return v;
exception when unique_violation then
  raise exception 'There is already an active call for you or this host.' using errcode = 'P0001', hint = 'call_in_progress';
end $$;

create or replace function public.call_tick(p_call_id uuid, p_both_connected boolean)
returns public.call_sessions language plpgsql security definer set search_path = '' as $$
declare
  c public.call_sessions;
  p public.minute_packages;
  v_now timestamptz := now();
  v_grace bigint := public.setting('call_grace_seconds');
  v_gap numeric;
  v_secs integer := 0;
  v_pkg_secs integer := 0;
  v_pkg_delta bigint := 0;
  v_pkg_used_cents bigint;
  v_rest integer;
  v_balance bigint;
  v_due bigint;
  v_delta bigint := 0;
  v_total bigint;
  v_host_due bigint;
  v_host_delta bigint := 0;
  v_plat_delta bigint := 0;
  v_out_of_funds boolean := false;
  v_key text;
begin
  select * into c from public.call_sessions where id = p_call_id for update;
  if not found then raise exception 'Unknown call.' using errcode = 'P0001'; end if;
  if c.status in ('ended', 'failed') then return c; end if;

  if not p_both_connected then
    if c.status = 'ringing' and v_now - c.created_at > make_interval(secs => public.setting('call_ring_timeout_seconds')) then
      update public.call_sessions set status = 'failed', end_reason = 'failed_to_connect', ended_at = v_now, last_tick_at = v_now
       where id = c.id returning * into c;
    elsif c.status = 'connected' and v_now - c.last_connected_at > make_interval(secs => v_grace) then
      update public.call_sessions set status = 'ended', end_reason = 'dropped', ended_at = v_now, last_tick_at = v_now
       where id = c.id returning * into c;
    else
      update public.call_sessions set last_tick_at = v_now where id = c.id returning * into c;
    end if;
    return c;
  end if;

  if c.status = 'ringing' then
    -- Billing starts now: nothing is charged for ringing time.
    update public.call_sessions set status = 'connected', connected_at = v_now, last_connected_at = v_now, last_tick_at = v_now
     where id = c.id returning * into c;
    return c;
  end if;

  v_gap := extract(epoch from (v_now - c.last_connected_at));
  if v_gap <= v_grace then
    v_secs := floor(v_gap)::integer;
  end if;

  if v_secs > 0 then
    v_key := 'call:' || c.id || ':' || (c.billed_seconds + v_secs);

    -- 1) Package minutes first (already paid; the value used = floor(paid × used / total)).
    if c.package_id is not null then
      select * into p from public.minute_packages where id = c.package_id for update;
      if p.status = 'active' and p.expires_at > v_now then
        v_pkg_secs := least(v_secs, p.seconds_total - p.seconds_used);
        if v_pkg_secs > 0 then
          v_pkg_used_cents := floor(p.paid_cents::numeric * (p.seconds_used + v_pkg_secs) / p.seconds_total);
          v_pkg_delta := v_pkg_used_cents - p.used_cents;
          update public.minute_packages
             set seconds_used = seconds_used + v_pkg_secs, used_cents = v_pkg_used_cents,
                 status = case when seconds_used + v_pkg_secs >= seconds_total then 'used' else status end,
                 closed_at = case when seconds_used + v_pkg_secs >= seconds_total then v_now else closed_at end
           where id = p.id;
        end if;
      end if;
    end if;

    -- 2) The rest from the wallet, at the normal per-minute price (same rules as before packages).
    v_rest := v_secs - v_pkg_secs;
    if v_rest > 0 then
      v_due := floor(c.price_cents_per_minute::numeric * ((c.billed_seconds - c.package_seconds) + v_rest) / 60);
      v_delta := v_due - (c.charged_cents - c.package_cents);
      insert into public.wallets (user_id) values (c.customer_id) on conflict do nothing;
      select case when c.livemode then balance_cents else test_balance_cents end into v_balance from public.wallets where user_id = c.customer_id for update;
      if v_delta >= v_balance then
        v_delta := v_balance;     -- take what's left, then end the call
        v_out_of_funds := true;
      end if;
      if v_delta > 0 then
        perform public.wallet_apply(c.customer_id, 'call_charge', -v_delta, c.id, v_key, c.livemode, 'Call charge');
      end if;
    end if;

    -- 3) Host share on the running total (package value + wallet), so cents never drift.
    v_total := v_pkg_delta + greatest(v_delta, 0);
    if v_total > 0 then
      v_host_due := floor((c.charged_cents + v_total)::numeric * (10000 - c.commission_bps) / 10000);
      v_host_delta := v_host_due - c.host_earnings_cents;
      v_plat_delta := v_total - v_host_delta;
      insert into public.call_billing_records (call_id, seconds, amount_cents, host_cents, platform_cents, idempotency_key)
      values (c.id, v_secs, v_total, v_host_delta, v_plat_delta, v_key);
      if v_host_delta > 0 then
        insert into public.host_earnings (host_id, kind, amount_cents, call_id, available_at, livemode, idempotency_key)
        values (c.host_id, 'call', v_host_delta, c.id, v_now + make_interval(days => public.setting('earnings_hold_days')::int), c.livemode, v_key);
      end if;
      if v_plat_delta > 0 then
        insert into public.platform_commissions (call_id, amount_cents, livemode, idempotency_key) values (c.id, v_plat_delta, c.livemode, v_key);
      end if;
    end if;

    update public.call_sessions set
      billed_seconds = billed_seconds + v_secs,
      package_seconds = package_seconds + v_pkg_secs,
      package_cents = package_cents + v_pkg_delta,
      charged_cents = charged_cents + v_total,
      host_earnings_cents = host_earnings_cents + greatest(v_host_delta, 0),
      platform_fee_cents = platform_fee_cents + greatest(v_plat_delta, 0),
      last_connected_at = last_connected_at + make_interval(secs => v_secs),
      last_tick_at = v_now,
      status = case when v_out_of_funds then 'ended'::public.call_status else status end,
      end_reason = case when v_out_of_funds then 'insufficient_funds' else end_reason end,
      ended_at = case when v_out_of_funds then v_now else ended_at end
    where id = c.id returning * into c;
  elsif v_gap > v_grace then
    -- Came back after an outage longer than the grace period: restart the clock, don't bill the gap.
    update public.call_sessions set last_connected_at = v_now, last_tick_at = v_now where id = c.id returning * into c;
  else
    update public.call_sessions set last_tick_at = v_now where id = c.id returning * into c;
  end if;
  return c;
end $$;

-- ---------------------------------------------------------------------
-- Admin: package settings
-- ---------------------------------------------------------------------
create or replace function public.admin_set_setting(p_key text, p_value bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old bigint;
begin
  perform public.assert_admin();
  -- Only known settings, each within sane limits.
  if not (
       (p_key = 'commission_bps'             and p_value between 0 and 9000)
    or (p_key in ('package_1_minutes', 'package_2_minutes', 'package_3_minutes') and p_value between 0 and 6000)
    or (p_key in ('package_1_discount_bps', 'package_2_discount_bps', 'package_3_discount_bps') and p_value between 0 and 5000)
    or (p_key = 'package_validity_days'      and p_value between 7 and 365)
    or (p_key = 'package_renewal_days'       and p_value between 7 and 90)
    or (p_key = 'demo_enabled'               and p_value between 0 and 1)
    or (p_key = 'demo_calls_enabled'         and p_value between 0 and 1)
    or (p_key = 'demo_max_hosts'             and p_value between 0 and 500)
    or (p_key = 'auto_suspend_reports'       and p_value between 0 and 50)
    or (p_key = 'declined_call_limit'        and p_value between 0 and 20)
    or (p_key = 'price_min_cents_per_minute' and p_value between 10 and 100000)
    or (p_key = 'price_max_cents_per_minute' and p_value between 10 and 100000)
    or (p_key = 'topup_min_cents'            and p_value between 100 and 10000000)
    or (p_key = 'topup_max_cents'            and p_value between 100 and 10000000)
    or (p_key = 'call_min_start_seconds'     and p_value between 0 and 3600)
    or (p_key = 'call_grace_seconds'         and p_value between 10 and 600)
    or (p_key = 'call_ring_timeout_seconds'  and p_value between 15 and 600)
    or (p_key = 'earnings_hold_days'         and p_value between 0 and 90)
    or (p_key = 'payout_min_cents'           and p_value between 1 and 10000000)
    or (p_key = 'allow_test_calls'           and p_value in (0, 1))
    or (p_key = 'first_topup_bonus_cents'    and p_value between 0 and 100000)
    or (p_key = 'first_topup_bonus_min_cents' and p_value between 0 and 10000000)
    or (p_key = 'referral_bonus_cents'       and p_value between 0 and 100000)
  ) then
    raise exception 'Invalid value for this setting.' using errcode = 'P0001';
  end if;
  if p_key = 'price_min_cents_per_minute' and p_value > public.setting('price_max_cents_per_minute') then
    raise exception 'The minimum price can''t be above the maximum.' using errcode = 'P0001';
  end if;
  if p_key = 'price_max_cents_per_minute' and p_value < public.setting('price_min_cents_per_minute') then
    raise exception 'The maximum price can''t be below the minimum.' using errcode = 'P0001';
  end if;
  select value into v_old from public.platform_settings where key = p_key;
  if not found then raise exception 'Unknown setting.' using errcode = 'P0001'; end if;
  update public.platform_settings set value = p_value, updated_at = now() where key = p_key;
  perform public.admin_log('setting', p_key, jsonb_build_object('from', v_old, 'to', p_value));
end $$;

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
revoke execute on function public.create_minute_package(uuid, uuid, public.call_type, smallint, uuid), public.close_minute_package(uuid, text),
  public.process_packages(uuid) from public, anon, authenticated;
grant execute on function public.process_packages(uuid) to service_role;
revoke execute on function public.buy_package(uuid, public.call_type, integer, boolean), public.cancel_package(uuid),
  public.set_package_renewal(uuid, boolean), public.my_packages(), public.call_package_left(uuid) from public, anon;
grant execute on function public.buy_package(uuid, public.call_type, integer, boolean), public.cancel_package(uuid),
  public.set_package_renewal(uuid, boolean), public.my_packages(), public.call_package_left(uuid) to authenticated;
grant execute on function public.package_offers(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
