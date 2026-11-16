-- =====================================================================
-- HUMI · Growth: first top-up bonus, referrals and signup source
--   * First real top-up of at least first_topup_bonus_min_cents earns first_topup_bonus_cents
--     of call credit (once per person). Set the bonus to 0 to switch it off.
--   * Referrals: everyone has a code (humi.chat/?ref=CODE). When an invited person makes their
--     first top-up, the person who invited them gets referral_bonus_cents of call credit.
--   * Bonuses are call credit: they can't be withdrawn and are taken back if the top-up that
--     triggered them is refunded.
--   * signup_source keeps where each account came from (utm_source, campaign…) for marketing.
-- Safe to run more than once.
-- =====================================================================

alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists signup_source jsonb;
create unique index if not exists profiles_referral_code_key on public.profiles (referral_code);

insert into public.platform_settings (key, value, description) values
  ('first_topup_bonus_cents',     500,  'Bonus credit on a person''s first top-up (cents). 0 = off.'),
  ('first_topup_bonus_min_cents', 2000, 'Minimum first top-up to earn the bonus (cents).'),
  ('referral_bonus_cents',        500,  'Credit for the person who invited someone, when that person makes their first top-up (cents). 0 = off.')
on conflict (key) do nothing;

-- Short, unambiguous referral codes (no 0/O/1/I).
create or replace function public.new_referral_code()
returns text language plpgsql volatile set search_path = '' as $fn$
declare v text; abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  loop
    v := '';
    for i in 1..7 loop
      v := v || substr(abc, 1 + floor(random() * length(abc))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = v);
  end loop;
  return v;
end $fn$;

create or replace function public.profiles_set_referral_code()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if new.referral_code is null then new.referral_code := public.new_referral_code(); end if;
  return new;
end $fn$;
drop trigger if exists profiles_referral_code on public.profiles;
create trigger profiles_referral_code before insert on public.profiles for each row execute function public.profiles_set_referral_code();
update public.profiles set referral_code = public.new_referral_code() where referral_code is null;

-- Called once by the site right after sign-up: stores where the person came from and who invited them.
create or replace function public.set_signup_source(p_source jsonb default null, p_ref text default null)
returns void language plpgsql security definer set search_path = '' as $fn$
declare v_me public.profiles; v_ref uuid;
begin
  select * into v_me from public.profiles where id = auth.uid() for update;
  if not found then return; end if;
  -- Only for new accounts, and only once.
  if v_me.created_at < now() - interval '2 days' then return; end if;
  if v_me.signup_source is null and p_source is not null and jsonb_typeof(p_source) = 'object' and length(p_source::text) <= 2000 then
    update public.profiles set signup_source = p_source where id = v_me.id;
  end if;
  if v_me.referred_by is null and nullif(btrim(coalesce(p_ref, '')), '') is not null then
    select id into v_ref from public.profiles where referral_code = upper(btrim(p_ref));
    if v_ref is not null and v_ref <> v_me.id then
      update public.profiles set referred_by = v_ref where id = v_me.id;
    end if;
  end if;
end $fn$;

-- First top-up bonus and referral reward (internal; called by confirm_topup).
create or replace function public.apply_topup_promos(p public.wallet_topups)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_bonus bigint := coalesce(public.setting('first_topup_bonus_cents'), 0);
  v_min bigint := coalesce(public.setting('first_topup_bonus_min_cents'), 0);
  v_ref_bonus bigint := coalesce(public.setting('referral_bonus_cents'), 0);
  v_referrer uuid;
  v_mode text := case when p.livemode then 'live' else 'test' end;
begin
  -- Only the person's FIRST approved top-up (in this mode) counts.
  if exists (select 1 from public.wallet_topups t where t.user_id = p.user_id and t.livemode = p.livemode and t.status in ('approved', 'refunded') and t.id <> p.id) then
    return;
  end if;
  if p.amount_cents < v_min then return; end if;
  if v_bonus > 0 then
    perform public.wallet_apply(p.user_id, 'adjustment', v_bonus, p.id, 'bonus-first:' || p.user_id || ':' || v_mode, p.livemode, 'Welcome bonus');
  end if;
  select referred_by into v_referrer from public.profiles where id = p.user_id;
  if v_referrer is not null and v_ref_bonus > 0 then
    perform public.wallet_apply(v_referrer, 'adjustment', v_ref_bonus, p.id, 'bonus-ref:' || p.user_id || ':' || v_mode, p.livemode, 'Referral bonus');
  end if;
end $fn$;

-- On refund: take the bonuses back (best effort for the referrer: only what they still have).
create or replace function public.reverse_topup_promos(p public.wallet_topups)
returns void language plpgsql security definer set search_path = '' as $fn$
declare r record;
begin
  for r in
    select user_id, amount_cents, idempotency_key from public.wallet_transactions
    where reference_id = p.id and kind = 'adjustment' and amount_cents > 0
      and (idempotency_key like 'bonus-first:%' or idempotency_key like 'bonus-ref:%')
  loop
    begin
      perform public.wallet_apply(r.user_id, 'adjustment', -r.amount_cents, p.id, r.idempotency_key || ':reversed', p.livemode, 'Bonus reversed (refund)');
    exception when others then
      null; -- already spent: kept as a promotional cost
    end;
  end loop;
end $fn$;

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
    perform public.apply_topup_promos(v);
  elsif p_status in ('declined', 'canceled') then
    if v.status = 'pending' then
      update public.wallet_topups set status = p_status, provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
             failure_reason = p_reason, updated_at = now() where id = v.id returning * into v;
    end if;
  elsif p_status = 'refunded' then
    if v.status = 'approved' then
      -- Remove the credit (fails if already spent; such cases need manual review).
      perform public.reverse_topup_promos(v);
      perform public.wallet_apply(v.user_id, 'refund', -v.amount_cents, v.id, 'topup-refund:' || v.id, v.livemode, 'Top-up refunded');
      update public.wallet_topups set status = 'refunded', updated_at = now() where id = v.id returning * into v;
    end if;
  end if;
  return v;
end $$;

-- Your invite link data: code, how many signed up with it and how much credit it earned you.
create or replace function public.my_referral()
returns table (referral_code text, invited integer, rewarded_cents bigint)
language sql stable security definer set search_path = '' as $fn$
  select p.referral_code,
         (select count(*)::int from public.profiles x where x.referred_by = p.id),
         (select coalesce(sum(t.amount_cents), 0) from public.wallet_transactions t
           where t.user_id = p.id and t.livemode and t.idempotency_key like 'bonus-ref:%' and t.amount_cents > 0)
  from public.profiles p where p.id = auth.uid();
$fn$;

-- Public promo numbers for the site (bonus banner, invite page).
create or replace function public.promo_settings()
returns table (first_topup_bonus_cents bigint, first_topup_bonus_min_cents bigint, referral_bonus_cents bigint)
language sql stable security definer set search_path = '' as $fn$
  select public.setting('first_topup_bonus_cents'), public.setting('first_topup_bonus_min_cents'), public.setting('referral_bonus_cents');
$fn$;

-- Has the signed-in person already made a (real) top-up? Drives the "first top-up bonus" banner.
create or replace function public.my_first_topup_done()
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.wallet_topups where user_id = auth.uid() and livemode and status in ('approved', 'refunded'));
$fn$;

-- Marketing: sign-ups and first top-ups per source (admins).
create or replace function public.admin_signup_sources(p_days integer default 30)
returns table (source text, campaign text, signups bigint, paying bigint)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform public.assert_admin();
  return query
  select coalesce(nullif(p.signup_source ->> 'utm_source', ''), case when p.referred_by is not null then 'referral' end, 'direct') as source,
         coalesce(p.signup_source ->> 'utm_campaign', '') as campaign,
         count(*) as signups,
         count(*) filter (where exists (select 1 from public.wallet_topups t where t.user_id = p.id and t.livemode and t.status = 'approved')) as paying
  from public.profiles p
  where p.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
  group by 1, 2
  order by 3 desc;
end $fn$;

create or replace function public.admin_set_setting(p_key text, p_value bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old bigint;
begin
  perform public.assert_admin();
  -- Only known settings, each within sane limits.
  if not (
       (p_key = 'commission_bps'             and p_value between 0 and 9000)
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

revoke execute on function public.new_referral_code(), public.apply_topup_promos(public.wallet_topups), public.reverse_topup_promos(public.wallet_topups) from public, anon, authenticated;
revoke execute on function public.set_signup_source(jsonb, text), public.my_referral(), public.my_first_topup_done(), public.admin_signup_sources(integer) from public, anon;
grant execute on function public.set_signup_source(jsonb, text), public.my_referral(), public.my_first_topup_done(), public.admin_signup_sources(integer) to authenticated;
revoke execute on function public.promo_settings() from public;
grant execute on function public.promo_settings() to anon, authenticated;

notify pgrst, 'reload schema';
