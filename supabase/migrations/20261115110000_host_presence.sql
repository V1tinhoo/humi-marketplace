-- =====================================================================
-- HUMI — real "online now" presence for hosts
-- Before: "online" was just the is_available switch, so a host who left
-- the site stayed "online" forever.
-- Now: the site sends a heartbeat every minute while a host has HUMI open.
-- A host is shown online only if the switch is ON *and* the last heartbeat
-- was less than 3 minutes ago. Safe to run more than once.
-- =====================================================================

alter table public.host_profiles add column if not exists last_seen_at timestamptz;

-- Clients can't write last_seen_at directly (it's not in the column grants);
-- only this function sets it — always to the server's clock.
create or replace function public.host_presence(p_online boolean default true)
returns void language sql security definer set search_path = '' as $$
  update public.host_profiles
     set last_seen_at = case when p_online then now() else null end
   where user_id = auth.uid();
$$;

revoke execute on function public.host_presence(boolean) from public, anon;
grant execute on function public.host_presence(boolean) to authenticated;

-- Public listing gets a computed is_online (appended as the last column).
create or replace view public.public_hosts as
select
  hp.id,
  hp.display_name,
  hp.tagline,
  hp.description,
  hp.experience,
  hp.session_price,
  hp.hourly_rate,
  hp.categories,
  hp.call_types,
  hp.timezone,
  hp.is_available,
  hp.is_verified,
  hp.average_rating,
  hp.review_count,
  hp.total_sessions,
  hp.created_at,
  p.avatar_url,
  p.bio,
  p.country,
  p.city,
  p.languages,
  p.interests,
  p.is_sample,
  coalesce((
    select jsonb_agg(jsonb_build_object('day_of_week', a.day_of_week, 'start_time', a.start_time, 'end_time', a.end_time, 'timezone', a.timezone)
                     order by a.day_of_week, a.start_time)
    from public.host_availability a where a.host_id = hp.id
  ), '[]'::jsonb) as availability,
  p.region,
  coalesce(hp.is_available and hp.last_seen_at > now() - interval '3 minutes', false) as is_online
from public.host_profiles hp
join public.profiles p on p.id = hp.user_id
where hp.is_published and p.role = 'host';

revoke all on public.public_hosts from anon, authenticated;
grant select on public.public_hosts to anon, authenticated;
