-- =====================================================================
-- HUMI · Safety: block people, automatic suspension, limit on refused calls,
-- community rules before the first call.
--   * Block: either side can block the other (from a call, a booking or a host
--     profile — no user ids needed). Blocked people can't call, book or see
--     each other; future bookings between them are cancelled.
--   * Automatic suspension: when N different people (setting
--     auto_suspend_reports, default 3) report someone after a real call or
--     booking within 7 days, the account is suspended until an admin reviews it
--     (login blocked, host profile hidden). Admins are never auto-suspended.
--   * Refused calls: if a host declined your last N calls (setting
--     declined_call_limit, default 3) in the past 24 h, you can't call that host
--     until the oldest of those is 24 h old.
--   * Rules: the date someone accepted the community rules before their first
--     call is recorded.
-- Safe to run more than once.
-- =====================================================================

alter table public.profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text,
  add column if not exists call_rules_accepted_at timestamptz;

insert into public.platform_settings (key, value, description) values
  ('auto_suspend_reports', 3, 'Different people reporting someone (after a call or booking) within 7 days that suspends the account until review. 0 = off.'),
  ('declined_call_limit',  3, 'Calls in a row a host can decline before the caller must wait 24 h to call that host again. 0 = off.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------
create table if not exists public.user_blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);
alter table public.user_blocks enable row level security;
drop policy if exists "blocks: own" on public.user_blocks;
create policy "blocks: own" on public.user_blocks for select to authenticated using (blocker_id = auth.uid() or public.is_admin());
revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;

create or replace function public.users_blocked(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_a is not null and p_b is not null and exists (
    select 1 from public.user_blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  )
$$;

create or replace function public.declined_too_often(p_customer uuid, p_host uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_limit integer := coalesce(public.setting('declined_call_limit'), 0); v_n integer; v_all boolean;
begin
  if v_limit <= 0 then return false; end if;
  select count(*), coalesce(bool_and(end_reason = 'declined'), false) into v_n, v_all
  from (select end_reason from public.call_sessions
        where customer_id = p_customer and host_id = p_host and created_at > now() - interval '24 hours'
        order by created_at desc limit v_limit) last_calls;
  return v_n >= v_limit and v_all;
end $$;

/** The other person in a call / booking, or the owner of a host profile. Same rules as reports. */
create or replace function public.other_party(p_call_id uuid, p_booking_id uuid, p_host_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_customer uuid; v_host_user uuid;
begin
  if v_uid is null then raise exception 'Please log in.' using errcode = '42501'; end if;
  if (p_call_id is not null)::int + (p_booking_id is not null)::int + (p_host_id is not null)::int <> 1 then
    raise exception 'Choose one call, booking or profile.' using errcode = 'P0001';
  end if;
  if p_call_id is not null then
    select cs.customer_id, hp.user_id into v_customer, v_host_user
    from public.call_sessions cs join public.host_profiles hp on hp.id = cs.host_id where cs.id = p_call_id;
  elsif p_booking_id is not null then
    select b.customer_id, hp.user_id into v_customer, v_host_user
    from public.bookings b join public.host_profiles hp on hp.id = b.host_id where b.id = p_booking_id;
  else
    select hp.user_id into v_host_user from public.host_profiles hp where hp.id = p_host_id;
    if v_host_user is null then raise exception 'Not found.' using errcode = 'P0001'; end if;
    if v_host_user = v_uid then raise exception 'You can''t block yourself.' using errcode = 'P0001'; end if;
    return v_host_user;
  end if;
  if v_host_user is null then raise exception 'Not found.' using errcode = 'P0001'; end if;
  if v_uid = v_customer then return v_host_user; end if;
  if v_uid = v_host_user then return v_customer; end if;
  raise exception 'You can only block people you talked to.' using errcode = '42501';
end $$;

create or replace function public.block_user(p_call_id uuid default null, p_booking_id uuid default null, p_host_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_target uuid;
begin
  v_target := public.other_party(p_call_id, p_booking_id, p_host_id);
  insert into public.user_blocks (blocker_id, blocked_id) values (v_uid, v_target) on conflict do nothing;
  -- Future sessions between the two are cancelled.
  update public.bookings b set status = 'cancelled', cancelled_by = v_uid
   where b.status in ('pending', 'confirmed') and b.scheduled_at > now()
     and ((b.customer_id = v_uid and b.host_id in (select id from public.host_profiles where user_id = v_target))
       or (b.customer_id = v_target and b.host_id in (select id from public.host_profiles where user_id = v_uid)));
  -- A call that is still ringing between them stops ringing.
  update public.call_sessions cs set status = 'failed', end_reason = 'declined', ended_at = now()
   where cs.status = 'ringing'
     and ((cs.customer_id = v_uid and cs.host_id in (select id from public.host_profiles where user_id = v_target))
       or (cs.customer_id = v_target and cs.host_id in (select id from public.host_profiles where user_id = v_uid)));
end $$;

create or replace function public.unblock_user(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_user;
$$;

create or replace function public.my_blocks()
returns table (user_id uuid, name text, avatar_url text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select ub.blocked_id,
         coalesce(nullif((select hp.display_name from public.host_profiles hp where hp.user_id = ub.blocked_id limit 1), ''), nullif(split_part(p.full_name, ' ', 1), ''), 'HUMI user'),
         p.avatar_url, ub.created_at
  from public.user_blocks ub join public.profiles p on p.id = ub.blocked_id
  where ub.blocker_id = auth.uid()
  order by ub.created_at desc
$$;

-- ---------------------------------------------------------------------
-- Community rules before the first call
-- ---------------------------------------------------------------------
create or replace function public.accept_call_rules()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set call_rules_accepted_at = coalesce(call_rules_accepted_at, now()) where id = auth.uid();
$$;

create or replace function public.call_rules_accepted()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select call_rules_accepted_at is not null from public.profiles where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------------
-- Automatic suspension after reports from different people
-- ---------------------------------------------------------------------
create or replace function public.suspend_user(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set suspended_at = coalesce(suspended_at, now()), suspended_reason = coalesce(suspended_reason, p_reason) where id = p_user;
  update public.host_profiles set is_published = false, is_available = false where user_id = p_user;
  -- Also block the login (Supabase Auth). Ignored where auth.users isn't writable.
  begin
    update auth.users set banned_until = now() + interval '100 years' where id = p_user;
  exception when others then null;
  end;
end $$;

create or replace function public.user_reports_auto_suspend()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_limit integer := coalesce(public.setting('auto_suspend_reports'), 0); v_n integer;
begin
  if v_limit <= 0 or new.context not in ('call', 'booking') then return new; end if;
  if exists (select 1 from public.platform_admins where user_id = new.reported_user_id) then return new; end if;
  if exists (select 1 from public.profiles where id = new.reported_user_id and suspended_at is not null) then return new; end if;
  select count(distinct reporter_id) into v_n from public.user_reports
   where reported_user_id = new.reported_user_id and context in ('call', 'booking')
     and status <> 'dismissed' and created_at > now() - interval '7 days';
  if v_n >= v_limit then
    perform public.suspend_user(new.reported_user_id, 'reports');
    insert into public.admin_actions (admin_id, action, target, details)
    values (null, 'auto_suspend', new.reported_user_id::text, jsonb_build_object('reports', v_n, 'days', 7));
  end if;
  return new;
end $$;

drop trigger if exists user_reports_auto_suspend on public.user_reports;
create trigger user_reports_auto_suspend after insert on public.user_reports
  for each row execute function public.user_reports_auto_suspend();

/** Admin: lift a suspension (the login is unblocked by the admin API route). */
create or replace function public.admin_clear_suspension(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  update public.profiles set suspended_at = null, suspended_reason = null where id = p_user;
  insert into public.admin_actions (admin_id, action, target) values (auth.uid(), 'clear_suspension', p_user::text);
end $$;

-- ---------------------------------------------------------------------
-- Existing functions/views, updated
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

create or replace function public.bookings_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_host public.host_profiles;
  v_quote record;
  v_uid uuid := auth.uid();
begin
  -- Signed-in callers can only book for themselves (service role / SQL editor have no uid).
  if v_uid is not null and new.customer_id is distinct from v_uid then
    raise exception 'You can only book sessions for yourself.' using errcode = '42501';
  end if;

  select * into v_host from public.host_profiles where id = new.host_id;
  if not found or not v_host.is_published then
    raise exception 'This host is not accepting bookings.' using errcode = 'P0001', hint = 'host_unavailable';
  end if;
  if v_host.user_id = new.customer_id then
    raise exception 'You can''t book a session with yourself.' using errcode = 'P0001', hint = 'self_booking';
  end if;
  if exists (select 1 from public.profiles where id = new.customer_id and suspended_at is not null) then
    raise exception 'Your account is suspended. Contact support.' using errcode = 'P0001', hint = 'suspended';
  end if;
  if public.users_blocked(new.customer_id, v_host.user_id) then
    raise exception 'This host is not accepting bookings.' using errcode = 'P0001', hint = 'host_unavailable';
  end if;
  if not (new.call_type = any (v_host.call_types)) then
    raise exception 'This host doesn''t offer % sessions.', new.call_type using errcode = 'P0001', hint = 'call_type_unavailable';
  end if;
  if new.scheduled_at < now() + interval '30 minutes' then
    raise exception 'Sessions must be booked at least 30 minutes in advance.' using errcode = 'P0001', hint = 'too_soon';
  end if;
  if new.scheduled_at > now() + interval '60 days' then
    raise exception 'Sessions can be booked up to 60 days ahead.' using errcode = 'P0001', hint = 'too_far';
  end if;

  -- The whole session must fit inside one of the host's weekly windows (in the window's own time zone).
  if not exists (
    select 1
    from public.host_availability a
    cross join lateral (select (new.scheduled_at at time zone a.timezone) as local_start) l
    where a.host_id = new.host_id
      and extract(dow from l.local_start) = a.day_of_week
      and l.local_start::time >= a.start_time
      and (l.local_start::time - time '00:00') + make_interval(mins => new.duration_minutes) <= (a.end_time - time '00:00')
  ) then
    raise exception 'That time is outside the host''s availability.' using errcode = 'P0001', hint = 'outside_availability';
  end if;

  select * into v_quote from public.humi_price_quote(v_host.session_price, new.duration_minutes, new.call_type);

  new.ends_at       := new.scheduled_at + make_interval(mins => new.duration_minutes);
  new.subtotal      := v_quote.subtotal;
  new.total_price   := v_quote.total_price;
  new.platform_fee  := v_quote.platform_fee;
  new.host_earnings := v_quote.host_earnings;
  new.currency      := 'USD';
  new.status        := 'pending';
  new.cancelled_by  := null;
  new.created_at    := now();
  new.updated_at    := now();
  return new;
end $$;

create or replace function public.admin_set_setting(p_key text, p_value bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old bigint;
begin
  perform public.assert_admin();
  -- Only known settings, each within sane limits.
  if not (
       (p_key = 'commission_bps'             and p_value between 0 and 9000)
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
  coalesce(hp.is_available and hp.last_seen_at > now() - interval '90 seconds', false) as is_online,
  pr.audio_cents_per_minute,
  pr.video_cents_per_minute
from public.host_profiles hp
join public.profiles p on p.id = hp.user_id
left join public.host_pricing pr on pr.host_id = hp.id
where hp.is_published and p.role = 'host'
  -- People who blocked you (or you blocked) don't see each other.
  and not exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = hp.user_id and ub.blocked_id = auth.uid())
       or (ub.blocker_id = auth.uid() and ub.blocked_id = hp.user_id)
  );

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
revoke execute on function public.users_blocked(uuid, uuid), public.declined_too_often(uuid, uuid), public.other_party(uuid, uuid, uuid),
  public.suspend_user(uuid, text), public.user_reports_auto_suspend() from public, anon, authenticated;
revoke execute on function public.block_user(uuid, uuid, uuid), public.unblock_user(uuid), public.my_blocks(),
  public.accept_call_rules(), public.call_rules_accepted(), public.admin_clear_suspension(uuid) from public, anon;
grant execute on function public.block_user(uuid, uuid, uuid), public.unblock_user(uuid), public.my_blocks(),
  public.accept_call_rules(), public.call_rules_accepted(), public.admin_clear_suspension(uuid) to authenticated;
grant select on public.public_hosts to anon, authenticated;

notify pgrst, 'reload schema';
