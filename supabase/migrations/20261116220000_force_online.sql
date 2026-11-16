-- =====================================================================
-- HUMI · Admin: force a host online for a period
-- The admin can make a host show as "Online now" for 1–72 hours, even
-- without the site open. It ends by itself at the chosen time, or when the
-- admin sets the host offline. Only admins can change it (no column grant).
-- If a customer calls a forced-online host who isn't on the site, the call
-- just rings until the ring timeout and ends with no charge.
-- Safe to run more than once.
-- =====================================================================

alter table public.host_profiles add column if not exists forced_online_until timestamptz;

-- Online = (switch on AND site open in the last 90 s) OR forced by an admin.
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
  coalesce((hp.is_available and hp.last_seen_at > now() - interval '90 seconds') or hp.forced_online_until > now(), false) as is_online,
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

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'users',            (select count(*) from public.profiles),
    'hosts',            (select count(*) from public.host_profiles),
    'hosts_published',  (select count(*) from public.host_profiles where is_published),
    'hosts_online',     (select count(*) from public.host_profiles where (is_available and last_seen_at > now() - interval '90 seconds') or forced_online_until > now()),
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

create or replace function public.admin_force_host_online(p_host_id uuid, p_hours integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_until timestamptz;
begin
  perform public.assert_admin();
  if p_hours is null or p_hours < 0 or p_hours > 72 then
    raise exception 'Choose between 1 and 72 hours (0 cancels).' using errcode = 'P0001';
  end if;
  v_until := case when p_hours = 0 then null else now() + make_interval(hours => p_hours) end;
  update public.host_profiles
     set forced_online_until = v_until,
         is_available = case when p_hours > 0 then true else is_available end,
         updated_at = now()
   where id = p_host_id;
  if not found then raise exception 'Host not found.' using errcode = 'P0001'; end if;
  perform public.admin_log(case when p_hours = 0 then 'force_online_cancel' else 'force_online' end, p_host_id::text,
                           jsonb_build_object('hours', p_hours));
  return v_until;
end $$;

-- "Set offline" also ends a forced-online period.
create or replace function public.admin_set_host_available(p_host_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  update public.host_profiles
     set is_available = coalesce(p_on, false),
         forced_online_until = case when coalesce(p_on, false) then forced_online_until else null end,
         updated_at = now()
   where id = p_host_id;
  if not found then raise exception 'Host not found.' using errcode = 'P0001'; end if;
  perform public.admin_log(case when p_on then 'host_available_on' else 'host_available_off' end, p_host_id::text);
end $$;

drop function if exists public.admin_hosts_presence();
create function public.admin_hosts_presence()
returns table (host_id uuid, is_available boolean, is_online boolean, last_seen_at timestamptz, forced_online_until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
    select h.id, h.is_available,
           coalesce((h.is_available and h.last_seen_at > now() - interval '90 seconds') or h.forced_online_until > now(), false),
           h.last_seen_at,
           case when h.forced_online_until > now() then h.forced_online_until end
    from public.host_profiles h;
end $$;

revoke execute on function public.admin_force_host_online(uuid, integer), public.admin_set_host_available(uuid, boolean), public.admin_hosts_presence() from public, anon;
grant execute on function public.admin_force_host_online(uuid, integer), public.admin_set_host_available(uuid, boolean), public.admin_hosts_presence() to authenticated;
grant select on public.public_hosts to anon, authenticated;

notify pgrst, 'reload schema';
