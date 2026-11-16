-- =====================================================================
-- HUMI — per-minute billing: wallet, immutable ledger, top-ups,
-- per-minute host pricing, call sessions, server-side billing,
-- host earnings (75%) and platform commission (25%, configurable).
--
-- Money is ALWAYS integer cents (BRL). Balances and earnings only change
-- through SECURITY DEFINER functions; clients can read their own rows only.
-- Billing ticks and top-up confirmation are service_role only (called by
-- the Next.js server after verifying LiveKit / the payment provider).
-- Run once, after the previous migrations.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Settings (backend-configurable; admins edit with SQL)
-- ---------------------------------------------------------------------
create table public.platform_settings (
  key         text primary key,
  value       bigint not null,
  description text not null,
  updated_at  timestamptz not null default now()
);

insert into public.platform_settings (key, value, description) values
  ('commission_bps',             2500,   'HUMI commission in basis points (2500 = 25%). Host receives the rest.'),
  ('price_min_cents_per_minute', 50,     'Minimum host price per minute (cents).'),
  ('price_max_cents_per_minute', 2000,   'Maximum host price per minute (cents).'),
  ('topup_min_cents',            1000,   'Minimum top-up (cents).'),
  ('topup_max_cents',            100000, 'Maximum top-up (cents).'),
  ('call_min_start_seconds',     60,     'Balance must cover at least this many seconds to start a call.'),
  ('call_grace_seconds',         45,     'Gap between connected checks that is still billed; longer gaps are not charged.'),
  ('call_ring_timeout_seconds',  90,     'A call not connected within this time fails (never charged).'),
  ('earnings_hold_days',         7,      'Days before host earnings become available for payout.')
on conflict (key) do nothing;

create or replace function public.setting(p_key text)
returns bigint language sql stable security definer set search_path = '' as $$
  select value from public.platform_settings where key = p_key;
$$;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.ledger_kind as enum ('topup', 'call_charge', 'refund', 'adjustment');
create type public.topup_status as enum ('pending', 'approved', 'declined', 'refunded', 'canceled');
create type public.call_status as enum ('ringing', 'connected', 'ended', 'failed');
create type public.earning_kind as enum ('call', 'payout', 'refund', 'adjustment');
create type public.payout_status as enum ('requested', 'processing', 'paid', 'failed', 'canceled');

-- ---------------------------------------------------------------------
-- Host per-minute pricing (audio and video independent)
-- ---------------------------------------------------------------------
create table public.host_pricing (
  host_id                    uuid primary key references public.host_profiles (id) on delete cascade,
  audio_cents_per_minute     integer not null default 100 check (audio_cents_per_minute > 0),
  video_cents_per_minute     integer check (video_cents_per_minute is null or video_cents_per_minute > 0),
  currency                   text not null default 'BRL',
  updated_at                 timestamptz not null default now()
);

-- Every existing and future host gets a row (default R$ 1,00/min audio, R$ 1,20/min video).
insert into public.host_pricing (host_id, audio_cents_per_minute, video_cents_per_minute)
select id, 100, 120 from public.host_profiles on conflict do nothing;

create or replace function public.host_profiles_create_pricing()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.host_pricing (host_id, audio_cents_per_minute, video_cents_per_minute) values (new.id, 100, 120)
  on conflict do nothing;
  return new;
end $$;
create trigger host_profiles_create_pricing after insert on public.host_profiles
  for each row execute function public.host_profiles_create_pricing();

-- Hosts change prices only through this function (limits come from platform_settings).
create or replace function public.set_host_pricing(p_audio_cents integer, p_video_cents integer)
returns public.host_pricing language plpgsql security definer set search_path = '' as $$
declare
  v_min bigint := public.setting('price_min_cents_per_minute');
  v_max bigint := public.setting('price_max_cents_per_minute');
  v_host uuid;
  v public.host_pricing;
begin
  select id into v_host from public.host_profiles where user_id = auth.uid();
  if v_host is null then raise exception 'Only hosts can set prices.' using errcode = '42501'; end if;
  if p_audio_cents is null or p_audio_cents < v_min or p_audio_cents > v_max
     or (p_video_cents is not null and (p_video_cents < v_min or p_video_cents > v_max)) then
    raise exception 'Price must be between % and % cents per minute.', v_min, v_max using errcode = 'P0001', hint = 'price_out_of_range';
  end if;
  insert into public.host_pricing (host_id, audio_cents_per_minute, video_cents_per_minute, updated_at)
  values (v_host, p_audio_cents, p_video_cents, now())
  on conflict (host_id) do update set audio_cents_per_minute = excluded.audio_cents_per_minute,
                                      video_cents_per_minute = excluded.video_cents_per_minute,
                                      updated_at = now()
  returning * into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Customer wallet + immutable ledger
-- ---------------------------------------------------------------------
create table public.wallets (
  user_id        uuid primary key references public.profiles (id) on delete restrict,
  balance_cents  bigint not null default 0 check (balance_cents >= 0),
  currency       text not null default 'BRL',
  updated_at     timestamptz not null default now()
);

create table public.wallet_transactions (
  id                   bigint generated always as identity primary key,
  user_id              uuid not null references public.profiles (id) on delete restrict,
  kind                 public.ledger_kind not null,
  amount_cents         bigint not null check (amount_cents <> 0), -- + credit, − debit
  balance_after_cents  bigint not null check (balance_after_cents >= 0),
  reference_id         uuid,               -- top-up id or call id
  idempotency_key      text not null unique,
  livemode             boolean not null,   -- false = test money
  description          text not null,
  created_at           timestamptz not null default now()
);
create index wallet_transactions_user_idx on public.wallet_transactions (user_id, created_at desc);

create table public.wallet_topups (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete restrict,
  amount_cents         bigint not null check (amount_cents > 0),
  currency             text not null default 'BRL',
  provider             text not null,                -- 'test' until a real provider is integrated
  provider_payment_id  text,
  method               text,                         -- pix, card, …
  status               public.topup_status not null default 'pending',
  livemode             boolean not null default false,
  failure_reason       text,
  created_at           timestamptz not null default now(),
  confirmed_at         timestamptz,
  updated_at           timestamptz not null default now(),
  constraint wallet_topups_provider_payment_unique unique (provider, provider_payment_id)
);
create index wallet_topups_user_idx on public.wallet_topups (user_id, created_at desc);

-- Ledgers are append-only.
create or replace function public.forbid_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Ledger rows are immutable (%).', tg_table_name using errcode = '42501';
end $$;
create trigger wallet_transactions_immutable before update or delete on public.wallet_transactions
  for each row execute function public.forbid_mutation();

-- Internal: atomic credit/debit with row lock; never negative; idempotent by key.
create or replace function public.wallet_apply(p_user uuid, p_kind public.ledger_kind, p_amount bigint, p_ref uuid, p_key text, p_livemode boolean, p_desc text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_balance bigint;
begin
  if exists (select 1 from public.wallet_transactions where idempotency_key = p_key) then
    select balance_cents into v_balance from public.wallets where user_id = p_user;
    return v_balance; -- already applied
  end if;
  insert into public.wallets (user_id) values (p_user) on conflict do nothing;
  select balance_cents into v_balance from public.wallets where user_id = p_user for update;
  if v_balance + p_amount < 0 then
    raise exception 'Insufficient balance.' using errcode = 'P0001', hint = 'insufficient_balance';
  end if;
  update public.wallets set balance_cents = v_balance + p_amount, updated_at = now() where user_id = p_user;
  insert into public.wallet_transactions (user_id, kind, amount_cents, balance_after_cents, reference_id, idempotency_key, livemode, description)
  values (p_user, p_kind, p_amount, v_balance + p_amount, p_ref, p_key, p_livemode, p_desc);
  return v_balance + p_amount;
end $$;

-- Customer starts a top-up (pending). Never credits anything.
create or replace function public.create_topup(p_amount_cents bigint, p_provider text, p_method text)
returns public.wallet_topups language plpgsql security definer set search_path = '' as $$
declare v public.wallet_topups;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_amount_cents < public.setting('topup_min_cents') or p_amount_cents > public.setting('topup_max_cents') then
    raise exception 'Top-up must be between % and % cents.', public.setting('topup_min_cents'), public.setting('topup_max_cents')
      using errcode = 'P0001', hint = 'topup_out_of_range';
  end if;
  insert into public.wallets (user_id) values (auth.uid()) on conflict do nothing;
  insert into public.wallet_topups (user_id, amount_cents, provider, method, livemode)
  values (auth.uid(), p_amount_cents, p_provider, p_method, p_provider <> 'test')
  returning * into v;
  return v;
end $$;

-- Provider webhook (service_role only): idempotent; credits ONLY on approval, ONLY once,
-- and only if the confirmed amount matches what was requested.
create or replace function public.confirm_topup(p_topup_id uuid, p_provider text, p_provider_payment_id text, p_amount_cents bigint, p_status public.topup_status, p_method text default null, p_reason text default null)
returns public.wallet_topups language plpgsql security definer set search_path = '' as $$
declare v public.wallet_topups;
begin
  select * into v from public.wallet_topups where id = p_topup_id for update;
  if not found or v.provider <> p_provider then raise exception 'Unknown top-up.' using errcode = 'P0001'; end if;
  if p_status = 'approved' then
    if v.status = 'approved' then return v; end if;                 -- repeated webhook: no-op
    if v.status <> 'pending' then raise exception 'Top-up is %.', v.status using errcode = 'P0001'; end if;
    if p_amount_cents <> v.amount_cents then raise exception 'Amount mismatch.' using errcode = 'P0001', hint = 'amount_mismatch'; end if;
    update public.wallet_topups set status = 'approved', provider_payment_id = p_provider_payment_id, method = coalesce(p_method, method),
           confirmed_at = now(), updated_at = now() where id = v.id returning * into v;
    perform public.wallet_apply(v.user_id, 'topup', v.amount_cents, v.id, 'topup:' || v.id, v.livemode,
                                'Top-up' || case when v.livemode then '' else ' (test)' end);
  elsif p_status in ('declined', 'canceled') then
    if v.status = 'pending' then
      update public.wallet_topups set status = p_status, provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
             failure_reason = p_reason, updated_at = now() where id = v.id returning * into v;
    end if;
  elsif p_status = 'refunded' then
    if v.status = 'approved' then
      -- Remove the credit (fails if already spent; such cases need manual review).
      perform public.wallet_apply(v.user_id, 'refund', -v.amount_cents, v.id, 'topup-refund:' || v.id, v.livemode, 'Top-up refunded');
      update public.wallet_topups set status = 'refunded', updated_at = now() where id = v.id returning * into v;
    end if;
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Calls + billing
-- ---------------------------------------------------------------------
create table public.call_sessions (
  id                      uuid primary key default gen_random_uuid(),
  booking_id              uuid references public.bookings (id) on delete set null,
  customer_id             uuid not null references public.profiles (id) on delete restrict,
  host_id                 uuid not null references public.host_profiles (id) on delete restrict,
  call_type               public.call_type not null,
  price_cents_per_minute  integer not null check (price_cents_per_minute > 0),  -- snapshot at start
  commission_bps          integer not null check (commission_bps between 0 and 10000),
  room_name               text not null unique,
  status                  public.call_status not null default 'ringing',
  end_reason              text,
  livemode                boolean not null default false,
  created_at              timestamptz not null default now(),
  connected_at            timestamptz,
  last_connected_at       timestamptz,     -- last server-verified moment both were in the room
  last_tick_at            timestamptz,
  ended_at                timestamptz,
  billed_seconds          integer not null default 0 check (billed_seconds >= 0),
  charged_cents           bigint not null default 0 check (charged_cents >= 0),
  host_earnings_cents     bigint not null default 0 check (host_earnings_cents >= 0),
  platform_fee_cents      bigint not null default 0 check (platform_fee_cents >= 0),
  constraint call_split_consistent check (charged_cents = host_earnings_cents + platform_fee_cents)
);
create index call_sessions_customer_idx on public.call_sessions (customer_id, created_at desc);
create index call_sessions_host_idx on public.call_sessions (host_id, created_at desc);
-- At most one active call per customer and per host.
create unique index call_sessions_one_active_customer on public.call_sessions (customer_id) where status in ('ringing', 'connected');
create unique index call_sessions_one_active_host on public.call_sessions (host_id) where status in ('ringing', 'connected');

create table public.call_billing_records (
  id               bigint generated always as identity primary key,
  call_id          uuid not null references public.call_sessions (id) on delete restrict,
  seconds          integer not null check (seconds >= 0),
  amount_cents     bigint not null check (amount_cents >= 0),
  host_cents       bigint not null check (host_cents >= 0),
  platform_cents   bigint not null check (platform_cents >= 0),
  idempotency_key  text not null unique,
  created_at       timestamptz not null default now(),
  constraint billing_split_consistent check (amount_cents = host_cents + platform_cents)
);
create trigger call_billing_records_immutable before update or delete on public.call_billing_records
  for each row execute function public.forbid_mutation();

create table public.host_earnings (
  id               bigint generated always as identity primary key,
  host_id          uuid not null references public.host_profiles (id) on delete restrict,
  kind             public.earning_kind not null,
  amount_cents     bigint not null check (amount_cents <> 0),  -- + earned, − paid out / reversed
  call_id          uuid references public.call_sessions (id) on delete restrict,
  payout_id        uuid,
  available_at     timestamptz not null default now(),
  livemode         boolean not null,
  idempotency_key  text not null unique,
  created_at       timestamptz not null default now()
);
create index host_earnings_host_idx on public.host_earnings (host_id, created_at desc);
create trigger host_earnings_immutable before update or delete on public.host_earnings
  for each row execute function public.forbid_mutation();

create table public.platform_commissions (
  id               bigint generated always as identity primary key,
  call_id          uuid not null references public.call_sessions (id) on delete restrict,
  amount_cents     bigint not null check (amount_cents > 0),
  livemode         boolean not null,
  idempotency_key  text not null unique,
  created_at       timestamptz not null default now()
);
create trigger platform_commissions_immutable before update or delete on public.platform_commissions
  for each row execute function public.forbid_mutation();

create table public.payout_accounts (
  host_id              uuid primary key references public.host_profiles (id) on delete cascade,
  provider             text,
  provider_account_id  text,
  status               text not null default 'not_connected' check (status in ('not_connected', 'pending_verification', 'active', 'restricted')),
  updated_at           timestamptz not null default now()
);

create table public.payout_records (
  id                  uuid primary key default gen_random_uuid(),
  host_id             uuid not null references public.host_profiles (id) on delete restrict,
  amount_cents        bigint not null check (amount_cents > 0),
  status              public.payout_status not null default 'requested',
  provider            text,
  provider_payout_id  text,
  livemode            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Customer starts a call (signed in). Checks balance; nothing is charged here.
create or replace function public.start_call(p_host_id uuid, p_call_type public.call_type, p_booking_id uuid default null)
returns public.call_sessions language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_host public.host_profiles;
  v_price integer;
  v_balance bigint;
  v_needed bigint;
  v public.call_sessions;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into v_host from public.host_profiles where id = p_host_id;
  if not found or not v_host.is_published then raise exception 'This host is not available.' using errcode = 'P0001', hint = 'host_unavailable'; end if;
  if v_host.user_id = v_uid then raise exception 'You can''t call yourself.' using errcode = 'P0001', hint = 'self_call'; end if;
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
  select balance_cents into v_balance from public.wallets where user_id = v_uid;
  v_needed := ceil(v_price * public.setting('call_min_start_seconds') / 60.0);
  if v_balance < v_needed then
    raise exception 'Add at least % cents to start this call.', v_needed - v_balance using errcode = 'P0001', hint = 'insufficient_balance';
  end if;

  insert into public.call_sessions (booking_id, customer_id, host_id, call_type, price_cents_per_minute, commission_bps, room_name, livemode)
  values (p_booking_id, v_uid, p_host_id, p_call_type, v_price, public.setting('commission_bps'),
          'humi-' || replace(gen_random_uuid()::text, '-', ''), false)
  returning * into v;
  return v;
exception when unique_violation then
  raise exception 'There is already an active call for you or this host.' using errcode = 'P0001', hint = 'call_in_progress';
end $$;

-- Ends a call (service_role; the server verifies who is hanging up).
create or replace function public.finish_call(p_call_id uuid, p_reason text)
returns public.call_sessions language plpgsql security definer set search_path = '' as $$
declare v public.call_sessions;
begin
  update public.call_sessions
     set status = case when status = 'ringing' then 'failed'::public.call_status else 'ended'::public.call_status end,
         end_reason = case when status = 'ringing' and p_reason not in ('customer_hangup', 'host_hangup', 'declined') then 'failed_to_connect'
                           when status = 'ringing' then p_reason else p_reason end,
         ended_at = now()
   where id = p_call_id and status in ('ringing', 'connected')
  returning * into v;
  if not found then select * into v from public.call_sessions where id = p_call_id; end if;
  return v;
end $$;

-- Core billing (service_role only). Called by the server every few seconds with the result of
-- asking LiveKit whether BOTH participants are in the room. Uses only the database clock.
--   * Only the time between two consecutive "both connected" checks is billed, and only if the
--     gap is within the grace period (drops/outages are not charged).
--   * Charge is per second: total due = floor(price × billed_seconds / 60); each tick charges
--     the difference, so rounding never drifts and nothing is charged twice.
--   * The wallet is locked; if it runs out the call ends ('insufficient_funds'), never negative.
create or replace function public.call_tick(p_call_id uuid, p_both_connected boolean)
returns public.call_sessions language plpgsql security definer set search_path = '' as $$
declare
  c public.call_sessions;
  v_now timestamptz := now();
  v_grace bigint := public.setting('call_grace_seconds');
  v_gap numeric;
  v_secs integer := 0;
  v_balance bigint;
  v_due bigint;
  v_delta bigint;
  v_host_due bigint;
  v_host_delta bigint;
  v_plat_delta bigint;
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
    v_due := floor(c.price_cents_per_minute::numeric * (c.billed_seconds + v_secs) / 60);
    v_delta := v_due - c.charged_cents;

    insert into public.wallets (user_id) values (c.customer_id) on conflict do nothing;
    select balance_cents into v_balance from public.wallets where user_id = c.customer_id for update;
    if v_delta >= v_balance then
      v_delta := v_balance;     -- take what's left, then end the call
      v_out_of_funds := true;
    end if;

    if v_delta > 0 then
      v_key := 'call:' || c.id || ':' || (c.billed_seconds + v_secs);
      perform public.wallet_apply(c.customer_id, 'call_charge', -v_delta, c.id, v_key, c.livemode, 'Call charge');
      -- Host share is computed on the running total so cents never drift.
      v_host_due := floor((c.charged_cents + v_delta)::numeric * (10000 - c.commission_bps) / 10000);
      v_host_delta := v_host_due - c.host_earnings_cents;
      v_plat_delta := v_delta - v_host_delta;
      insert into public.call_billing_records (call_id, seconds, amount_cents, host_cents, platform_cents, idempotency_key)
      values (c.id, v_secs, v_delta, v_host_delta, v_plat_delta, v_key);
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
      charged_cents = charged_cents + greatest(v_delta, 0),
      host_earnings_cents = host_earnings_cents + greatest(coalesce(v_host_delta, 0), 0),
      platform_fee_cents = platform_fee_cents + greatest(coalesce(v_plat_delta, 0), 0),
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
-- Read helpers for the UI
-- ---------------------------------------------------------------------
create or replace view public.my_host_earnings_summary as
select hp.id as host_id,
       coalesce(sum(e.amount_cents) filter (where e.kind = 'call'), 0)                                  as total_earned_cents,
       coalesce(sum(e.amount_cents) filter (where e.available_at <= now()), 0)                           as available_cents,
       coalesce(sum(e.amount_cents) filter (where e.available_at > now()), 0)                            as pending_cents,
       (select coalesce(sum(cs.platform_fee_cents), 0) from public.call_sessions cs where cs.host_id = hp.id) as commission_cents,
       (select count(*) from public.call_sessions cs where cs.host_id = hp.id and cs.billed_seconds > 0)     as calls_count,
       (select coalesce(sum(cs.billed_seconds), 0) from public.call_sessions cs where cs.host_id = hp.id)    as billed_seconds
from public.host_profiles hp
left join public.host_earnings e on e.host_id = hp.id
where hp.user_id = auth.uid()
group by hp.id;

-- A participant's calls with the other side's first name (customers never see host user ids, hosts only the guest's first name).
create or replace view public.my_calls as
select cs.id, cs.booking_id, cs.host_id, cs.call_type, cs.price_cents_per_minute, cs.commission_bps, cs.room_name, cs.status,
       cs.end_reason, cs.livemode, cs.created_at, cs.connected_at, cs.ended_at, cs.billed_seconds, cs.charged_cents,
       cs.host_earnings_cents, cs.platform_fee_cents,
       split_part(p.full_name, ' ', 1) as customer_name,
       hp.display_name as host_name,
       (hp.user_id = auth.uid()) as i_am_host
from public.call_sessions cs
join public.profiles p on p.id = cs.customer_id
join public.host_profiles hp on hp.id = cs.host_id
where cs.customer_id = auth.uid() or hp.user_id = auth.uid();

-- Public listing: add per-minute prices (appended columns).
create or replace view public.public_hosts as
select
  hp.id, hp.display_name, hp.tagline, hp.description, hp.experience, hp.session_price, hp.hourly_rate,
  hp.categories, hp.call_types, hp.timezone, hp.is_available, hp.is_verified, hp.average_rating,
  hp.review_count, hp.total_sessions, hp.created_at,
  p.avatar_url, p.bio, p.country, p.city, p.languages, p.interests, p.is_sample,
  coalesce((
    select jsonb_agg(jsonb_build_object('day_of_week', a.day_of_week, 'start_time', a.start_time, 'end_time', a.end_time, 'timezone', a.timezone)
                     order by a.day_of_week, a.start_time)
    from public.host_availability a where a.host_id = hp.id
  ), '[]'::jsonb) as availability,
  p.region,
  coalesce(hp.is_available and hp.last_seen_at > now() - interval '3 minutes', false) as is_online,
  pr.audio_cents_per_minute,
  pr.video_cents_per_minute
from public.host_profiles hp
join public.profiles p on p.id = hp.user_id
left join public.host_pricing pr on pr.host_id = hp.id
where hp.is_published and p.role = 'host';

-- ---------------------------------------------------------------------
-- Bookings become free reservations (billing happens per minute during the call).
-- Old rows keep their historical amounts; new rows store zero.
-- ---------------------------------------------------------------------
create or replace function public.bookings_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  return new; -- no demo payment rows any more: reservations are free
end $$;

create or replace function public.bookings_zero_prices()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.subtotal := 0; new.total_price := 0; new.platform_fee := 0; new.host_earnings := 0; new.currency := 'BRL';
  return new;
end $$;
-- Runs after the validation trigger (trigger names fire alphabetically: bookings_before_insert < bookings_zz_prices).
create trigger bookings_zz_prices before insert on public.bookings for each row execute function public.bookings_zero_prices();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.platform_settings     enable row level security;
alter table public.host_pricing          enable row level security;
alter table public.wallets               enable row level security;
alter table public.wallet_transactions   enable row level security;
alter table public.wallet_topups         enable row level security;
alter table public.call_sessions         enable row level security;
alter table public.call_billing_records  enable row level security;
alter table public.host_earnings         enable row level security;
alter table public.platform_commissions  enable row level security;
alter table public.payout_accounts       enable row level security;
alter table public.payout_records        enable row level security;

create policy "settings: public read" on public.platform_settings for select to anon, authenticated using (true);
create policy "pricing: public read" on public.host_pricing for select to anon, authenticated using (true);
create policy "wallets: own" on public.wallets for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "wallet tx: own" on public.wallet_transactions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "topups: own" on public.wallet_topups for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "calls: participants" on public.call_sessions for select to authenticated
  using (customer_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));
create policy "billing: participants" on public.call_billing_records for select to authenticated
  using (exists (select 1 from public.call_sessions cs where cs.id = call_id and (cs.customer_id = auth.uid()
         or exists (select 1 from public.host_profiles hp where hp.id = cs.host_id and hp.user_id = auth.uid())))) ;
create policy "earnings: own host" on public.host_earnings for select to authenticated
  using (public.is_admin() or exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));
create policy "commissions: admin" on public.platform_commissions for select to authenticated using (public.is_admin());
create policy "payout accounts: own host" on public.payout_accounts for select to authenticated
  using (public.is_admin() or exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));
create policy "payouts: own host" on public.payout_records for select to authenticated
  using (public.is_admin() or exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));

-- No client writes anywhere in the money tables.
revoke insert, update, delete on public.platform_settings, public.host_pricing, public.wallets, public.wallet_transactions,
  public.wallet_topups, public.call_sessions, public.call_billing_records, public.host_earnings, public.platform_commissions,
  public.payout_accounts, public.payout_records from anon, authenticated;
revoke all on public.wallets, public.wallet_transactions, public.wallet_topups, public.call_sessions, public.call_billing_records,
  public.host_earnings, public.platform_commissions, public.payout_accounts, public.payout_records from anon;

revoke all on public.public_hosts, public.my_host_earnings_summary, public.my_calls from anon, authenticated;
grant select on public.public_hosts to anon, authenticated;
grant select on public.my_host_earnings_summary, public.my_calls to authenticated;

-- Function privileges: clients may only start top-ups/calls and set their own price.
revoke execute on function public.setting(text), public.wallet_apply(uuid, public.ledger_kind, bigint, uuid, text, boolean, text),
  public.create_topup(bigint, text, text), public.confirm_topup(uuid, text, text, bigint, public.topup_status, text, text),
  public.start_call(uuid, public.call_type, uuid), public.finish_call(uuid, text), public.call_tick(uuid, boolean),
  public.set_host_pricing(integer, integer), public.host_profiles_create_pricing(), public.bookings_zero_prices(), public.forbid_mutation()
  from public, anon, authenticated;
grant execute on function public.create_topup(bigint, text, text) to authenticated;
grant execute on function public.start_call(uuid, public.call_type, uuid) to authenticated;
grant execute on function public.set_host_pricing(integer, integer) to authenticated;
grant execute on function public.confirm_topup(uuid, text, text, bigint, public.topup_status, text, text) to service_role;
grant execute on function public.call_tick(uuid, boolean) to service_role;
grant execute on function public.finish_call(uuid, text) to service_role;
grant execute on function public.setting(text) to service_role;
