-- =====================================================================
-- HUMI · Admin (platform administrators)
--   * Admin is a PERMISSION, separate from the account type: a host stays a host
--     (and stays listed in Explore) when they become an admin.
--   * Every admin function checks is_admin() in the database. The SQL editor
--     (no signed-in user) can call them too.
--   * Making someone admin the first time (run in the SQL editor):
--       insert into public.platform_admins (user_id)
--       select id from auth.users where email = 'PERSON@EMAIL' on conflict do nothing;
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

-- Admin = in platform_admins (or the legacy 'admin' account role).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
      or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- The site asks "am I an admin?" to show the admin area.
create or replace function public.am_i_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin();
$$;

-- Internal guard: signed-in admins, or the SQL editor (no signed-in user).
create or replace function public.assert_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
end $$;

-- Who did what (every admin action is logged).
create table if not exists public.admin_actions (
  id          bigint generated always as identity primary key,
  admin_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  target      text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon, authenticated;

create or replace function public.admin_log(p_action text, p_target text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_actions (admin_id, action, target, details) values (auth.uid(), p_action, p_target, coalesce(p_details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------
-- Overview numbers
-- ---------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'users',            (select count(*) from public.profiles),
    'hosts',            (select count(*) from public.host_profiles),
    'hosts_published',  (select count(*) from public.host_profiles where is_published),
    'hosts_online',     (select count(*) from public.host_profiles where is_available and last_seen_at > now() - interval '90 seconds'),
    'calls_total',      (select count(*) from public.call_sessions where billed_seconds > 0),
    'calls_today',      (select count(*) from public.call_sessions where billed_seconds > 0 and created_at >= date_trunc('day', now())),
    'calls_live_now',   (select count(*) from public.call_sessions where status in ('ringing', 'connected')),
    'minutes_total',    (select coalesce(sum(billed_seconds), 0) / 60 from public.call_sessions),
    'revenue_cents',    (select coalesce(sum(charged_cents), 0) from public.call_sessions where livemode),
    'commission_cents', (select coalesce(sum(amount_cents), 0) from public.platform_commissions where livemode),
    'topups_cents',     (select coalesce(sum(amount_cents), 0) from public.wallet_topups where livemode and status = 'approved'),
    'wallets_cents',    (select coalesce(sum(balance_cents), 0) from public.wallets),
    'host_owed_cents',  (select coalesce(sum(amount_cents), 0) from public.host_earnings where livemode),
    'payouts_open',     (select count(*) from public.payout_records where status in ('requested', 'processing')),
    'payouts_open_cents', (select coalesce(sum(amount_cents), 0) from public.payout_records where status in ('requested', 'processing')),
    'reports_open',     (select count(*) from public.user_reports where status in ('open', 'reviewing'))
  );
end $$;

-- ---------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------
create or replace function public.admin_list_users(p_search text default null, p_limit integer default 50)
returns table (
  id uuid, email text, full_name text, role public.user_role, created_at timestamptz, country text,
  avatar_url text, is_admin boolean, banned boolean, host_id uuid, host_published boolean,
  balance_cents bigint, test_balance_cents bigint, host_available_cents bigint, reports_against bigint
) language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform public.assert_admin();
  return query
  select p.id, u.email::text, p.full_name, p.role, p.created_at, p.country, p.avatar_url,
         exists (select 1 from public.platform_admins a where a.user_id = p.id) or p.role = 'admin',
         coalesce(u.banned_until > now(), false),
         hp.id, hp.is_published,
         coalesce(w.balance_cents, 0), coalesce(w.test_balance_cents, 0),
         case when hp.id is null then 0 else public.host_available_cents(hp.id) end,
         (select count(*) from public.user_reports r where r.reported_user_id = p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.host_profiles hp on hp.user_id = p.id
  left join public.wallets w on w.user_id = p.id
  where v_q is null or p.full_name ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%' or p.id::text = v_q
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

create or replace function public.admin_set_admin(p_user_id uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if p_admin then
    insert into public.platform_admins (user_id, created_by) values (p_user_id, auth.uid()) on conflict do nothing;
  else
    if p_user_id = auth.uid() then raise exception 'You can''t remove your own admin access.' using errcode = 'P0001'; end if;
    delete from public.platform_admins where user_id = p_user_id;
  end if;
  perform public.admin_log(case when p_admin then 'grant_admin' else 'revoke_admin' end, p_user_id::text);
end $$;

create or replace function public.admin_set_host_published(p_host_id uuid, p_published boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  update public.host_profiles set is_published = p_published, updated_at = now() where id = p_host_id;
  if not found then raise exception 'Host not found.' using errcode = 'P0001'; end if;
  perform public.admin_log(case when p_published then 'show_host' else 'hide_host' end, p_host_id::text);
end $$;

-- Wallet credit / debit (e.g. refund). Real money unless p_test.
create or replace function public.admin_adjust_wallet(p_user_id uuid, p_amount_cents bigint, p_reason text, p_test boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_balance bigint; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.assert_admin();
  if p_amount_cents is null or p_amount_cents = 0 or abs(p_amount_cents) > 1000000 then
    raise exception 'Enter an amount between R$ 0,01 and R$ 10.000,00.' using errcode = 'P0001';
  end if;
  if v_reason is null then raise exception 'Write a reason.' using errcode = 'P0001'; end if;
  v_balance := public.wallet_apply(p_user_id, 'adjustment', p_amount_cents, null,
                                   'admin-wallet:' || gen_random_uuid(), not coalesce(p_test, false), 'Adjustment: ' || left(v_reason, 120));
  perform public.admin_log('wallet_adjustment', p_user_id::text, jsonb_build_object('amount_cents', p_amount_cents, 'reason', v_reason, 'test', coalesce(p_test, false)));
  return v_balance;
end $$;

-- Host earnings adjustment (available for withdrawal right away). Negative values remove.
create or replace function public.admin_adjust_earnings(p_host_id uuid, p_amount_cents bigint, p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.assert_admin();
  if p_amount_cents is null or p_amount_cents = 0 or abs(p_amount_cents) > 1000000 then
    raise exception 'Enter an amount between R$ 0,01 and R$ 10.000,00.' using errcode = 'P0001';
  end if;
  if v_reason is null then raise exception 'Write a reason.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.host_profiles where id = p_host_id) then raise exception 'Host not found.' using errcode = 'P0001'; end if;
  if p_amount_cents < 0 and public.host_available_cents(p_host_id) + p_amount_cents < 0 then
    raise exception 'That would make the host''s available balance negative.' using errcode = 'P0001';
  end if;
  insert into public.host_earnings (host_id, kind, amount_cents, available_at, livemode, idempotency_key)
  values (p_host_id, 'adjustment', p_amount_cents, now(), true, 'admin-earnings:' || gen_random_uuid());
  perform public.admin_log('earnings_adjustment', p_host_id::text, jsonb_build_object('amount_cents', p_amount_cents, 'reason', v_reason));
  return public.host_available_cents(p_host_id);
end $$;

-- ---------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------
alter table public.user_reports add column if not exists admin_note text check (char_length(admin_note) <= 1000);

create or replace function public.admin_list_reports(p_status text default null)
returns table (
  id uuid, created_at timestamptz, status public.report_status, reason public.report_reason, context text, details text, admin_note text,
  reporter_id uuid, reporter_name text, reported_user_id uuid, reported_name text, reported_email text, call_id uuid
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
  select r.id, r.created_at, r.status, r.reason, r.context, r.details, r.admin_note,
         r.reporter_id, rp.full_name, r.reported_user_id, tp.full_name, tu.email::text, r.call_id
  from public.user_reports r
  join public.profiles rp on rp.id = r.reporter_id
  join public.profiles tp on tp.id = r.reported_user_id
  join auth.users tu on tu.id = r.reported_user_id
  where p_status is null or r.status::text = p_status
  order by (r.status in ('open', 'reviewing')) desc, r.created_at desc
  limit 200;
end $$;

create or replace function public.admin_update_report(p_report_id uuid, p_status public.report_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  update public.user_reports set status = p_status, admin_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), admin_note), updated_at = now()
  where id = p_report_id;
  if not found then raise exception 'Report not found.' using errcode = 'P0001'; end if;
  perform public.admin_log('report_' || p_status::text, p_report_id::text, jsonb_build_object('note', p_note));
end $$;

-- ---------------------------------------------------------------------
-- Calls, top-ups, payouts (read)
-- ---------------------------------------------------------------------
create or replace function public.admin_list_calls(p_limit integer default 100)
returns table (
  id uuid, created_at timestamptz, status public.call_status, call_type public.call_type, livemode boolean,
  customer_name text, host_name text, billed_seconds integer, charged_cents bigint, host_earnings_cents bigint,
  platform_fee_cents bigint, end_reason text
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
  select cs.id, cs.created_at, cs.status, cs.call_type, cs.livemode, cp.full_name, hp.display_name,
         cs.billed_seconds, cs.charged_cents, cs.host_earnings_cents, cs.platform_fee_cents, cs.end_reason
  from public.call_sessions cs
  join public.profiles cp on cp.id = cs.customer_id
  join public.host_profiles hp on hp.id = cs.host_id
  order by cs.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

create or replace function public.admin_list_topups(p_limit integer default 100)
returns table (
  id uuid, created_at timestamptz, status public.topup_status, amount_cents bigint, method text, provider text,
  livemode boolean, user_name text, user_email text, provider_payment_id text
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
  select t.id, t.created_at, t.status, t.amount_cents, t.method, t.provider, t.livemode, p.full_name, u.email::text, t.provider_payment_id
  from public.wallet_topups t
  join public.profiles p on p.id = t.user_id
  join auth.users u on u.id = t.user_id
  order by t.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

create or replace function public.admin_list_payouts()
returns table (
  id uuid, created_at timestamptz, updated_at timestamptz, status public.payout_status, amount_cents bigint,
  host_id uuid, display_name text, full_name text, email text, pix_key_type text, pix_key text
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
  select pr.id, pr.created_at, pr.updated_at, pr.status, pr.amount_cents, pr.host_id, hp.display_name, p.full_name, u.email::text,
         pa.pix_key_type, pa.provider_account_id
  from public.payout_records pr
  join public.host_profiles hp on hp.id = pr.host_id
  join public.profiles p on p.id = hp.user_id
  join auth.users u on u.id = hp.user_id
  left join public.payout_accounts pa on pa.host_id = pr.host_id
  order by (pr.status in ('requested', 'processing')) desc, pr.created_at desc
  limit 300;
end $$;

-- Payout status changes by admins are logged too.
create or replace function public.admin_update_payout(p_payout_id uuid, p_status public.payout_status)
returns public.payout_records language plpgsql security definer set search_path = '' as $$
declare v public.payout_records;
begin
  perform public.assert_admin();
  select * into v from public.payout_records where id = p_payout_id for update;
  if not found then raise exception 'Withdrawal not found.' using errcode = 'P0001'; end if;
  if v.status in ('paid', 'failed', 'canceled') then raise exception 'This withdrawal is already %.', v.status using errcode = 'P0001'; end if;
  update public.payout_records set status = p_status, updated_at = now() where id = v.id returning * into v;
  if p_status in ('failed', 'canceled') then perform public.payout_release(v); end if;
  perform public.admin_log('payout_' || p_status::text, p_payout_id::text, jsonb_build_object('amount_cents', v.amount_cents));
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
create or replace function public.admin_list_settings()
returns table (key text, value bigint, description text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query select s.key, s.value, s.description, s.updated_at from public.platform_settings s
  where s.key not in ('wallet_split_done') order by s.key;
end $$;

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

create or replace function public.admin_list_actions(p_limit integer default 100)
returns table (id bigint, created_at timestamptz, admin_name text, action text, target text, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
  select a.id, a.created_at, p.full_name, a.action, a.target, a.details
  from public.admin_actions a left join public.profiles p on p.id = a.admin_id
  order by a.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

-- ---------------------------------------------------------------------
-- Privileges: helpers are internal; admin functions callable by signed-in users
-- (each one checks is_admin itself).
-- ---------------------------------------------------------------------
revoke execute on function public.assert_admin(), public.admin_log(text, text, jsonb) from public, anon, authenticated;
revoke execute on function
  public.am_i_admin(), public.admin_overview(), public.admin_list_users(text, integer), public.admin_set_admin(uuid, boolean),
  public.admin_set_host_published(uuid, boolean), public.admin_adjust_wallet(uuid, bigint, text, boolean),
  public.admin_adjust_earnings(uuid, bigint, text), public.admin_list_reports(text), public.admin_update_report(uuid, public.report_status, text),
  public.admin_list_calls(integer), public.admin_list_topups(integer), public.admin_list_payouts(),
  public.admin_update_payout(uuid, public.payout_status), public.admin_list_settings(), public.admin_set_setting(text, bigint),
  public.admin_list_actions(integer)
from public, anon;
grant execute on function
  public.am_i_admin(), public.admin_overview(), public.admin_list_users(text, integer), public.admin_set_admin(uuid, boolean),
  public.admin_set_host_published(uuid, boolean), public.admin_adjust_wallet(uuid, bigint, text, boolean),
  public.admin_adjust_earnings(uuid, bigint, text), public.admin_list_reports(text), public.admin_update_report(uuid, public.report_status, text),
  public.admin_list_calls(integer), public.admin_list_topups(integer), public.admin_list_payouts(),
  public.admin_update_payout(uuid, public.payout_status), public.admin_list_settings(), public.admin_set_setting(text, bigint),
  public.admin_list_actions(integer)
to authenticated;

notify pgrst, 'reload schema';
