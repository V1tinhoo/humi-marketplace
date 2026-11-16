-- =====================================================================
-- HUMI · Real money (go-live)
--   * Wallets keep REAL and TEST balances apart (test top-ups never become real money).
--   * A call is "live" only when paid with real balance; its host earnings are then real
--     (before this, every call was stored as a test call).
--   * Test balance can only pay test calls, and can be switched off entirely:
--       update public.platform_settings set value = 0 where key = 'allow_test_calls';
--   * "Available" / "Pending" earnings count real money only.
-- Safe to run more than once.
-- =====================================================================

alter table public.wallets add column if not exists test_balance_cents bigint not null default 0;
alter table public.wallets drop constraint if exists wallets_test_balance_nonneg;
alter table public.wallets add constraint wallets_test_balance_nonneg check (test_balance_cents >= 0);

insert into public.platform_settings (key, value, description) values
  ('allow_test_calls', 1, '1 = test balance can pay test calls; 0 = only real money (set to 0 when live).')
on conflict (key) do nothing;

-- One-time split of existing balances: real money = what came in as real (live) money and is
-- still there; everything else is test balance. Runs only once (marker row).
do $$
begin
  if not exists (select 1 from public.platform_settings where key = 'wallet_split_done') then
    update public.wallets w set
      test_balance_cents = w.balance_cents - least(w.balance_cents, greatest(0, coalesce(r.real_cents, 0))),
      balance_cents      = least(w.balance_cents, greatest(0, coalesce(r.real_cents, 0)))
    from (
      select wl.user_id, (select sum(t.amount_cents) from public.wallet_transactions t where t.user_id = wl.user_id and t.livemode) as real_cents
      from public.wallets wl
    ) r
    where r.user_id = w.user_id;
    insert into public.platform_settings (key, value, description) values ('wallet_split_done', 1, 'Internal marker: wallet balances were split into real and test.');
  end if;
end $$;

-- Ledger writes go to the right pot.
create or replace function public.wallet_apply(p_user uuid, p_kind public.ledger_kind, p_amount bigint, p_ref uuid, p_key text, p_livemode boolean, p_desc text)
returns bigint language plpgsql security definer set search_path = '' as $fn$
declare v_balance bigint;
begin
  if exists (select 1 from public.wallet_transactions where idempotency_key = p_key) then
    select case when p_livemode then balance_cents else test_balance_cents end into v_balance from public.wallets where user_id = p_user;
    return v_balance; -- already applied
  end if;
  insert into public.wallets (user_id) values (p_user) on conflict do nothing;
  select case when p_livemode then balance_cents else test_balance_cents end into v_balance from public.wallets where user_id = p_user for update;
  if v_balance + p_amount < 0 then
    raise exception 'Insufficient balance.' using errcode = 'P0001', hint = 'insufficient_balance';
  end if;
  if p_livemode then
    update public.wallets set balance_cents = v_balance + p_amount, updated_at = now() where user_id = p_user;
  else
    update public.wallets set test_balance_cents = v_balance + p_amount, updated_at = now() where user_id = p_user;
  end if;
  insert into public.wallet_transactions (user_id, kind, amount_cents, balance_after_cents, reference_id, idempotency_key, livemode, description)
  values (p_user, p_kind, p_amount, v_balance + p_amount, p_ref, p_key, p_livemode, p_desc);
  return v_balance + p_amount;
end $fn$;

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
  select balance_cents, test_balance_cents into v_balance, v_test from public.wallets where user_id = v_uid;
  v_needed := ceil(v_price * public.setting('call_min_start_seconds') / 60.0);
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
    -- Each call spends from its own pot: real balance for live calls, test balance for test calls.
    select case when c.livemode then balance_cents else test_balance_cents end into v_balance from public.wallets where user_id = c.customer_id for update;
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

-- Earnings summary: "available" and "pending" are real money only; test earnings shown apart.
create or replace view public.my_host_earnings_summary as
select hp.id as host_id,
       coalesce(sum(e.amount_cents) filter (where e.kind = 'call'), 0)                         as total_earned_cents,
       coalesce(sum(e.amount_cents) filter (where e.livemode and e.available_at <= now()), 0)  as available_cents,
       coalesce(sum(e.amount_cents) filter (where e.livemode and e.available_at > now()), 0)   as pending_cents,
       (select count(*) from public.call_sessions cs where cs.host_id = hp.id and cs.billed_seconds > 0)  as calls_count,
       (select coalesce(sum(cs.billed_seconds), 0) from public.call_sessions cs where cs.host_id = hp.id) as billed_seconds,
       coalesce(sum(e.amount_cents) filter (where not e.livemode and e.kind = 'call'), 0)       as test_earned_cents
from public.host_profiles hp
left join public.host_earnings e on e.host_id = hp.id
where hp.user_id = auth.uid()
group by hp.id;

revoke all on public.my_host_earnings_summary from anon, authenticated;
grant select on public.my_host_earnings_summary to authenticated;

notify pgrst, 'reload schema';
