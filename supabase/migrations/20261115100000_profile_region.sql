-- =====================================================================
-- HUMI — state / region on profiles
-- Profiles now store the state/region (e.g. "São Paulo", "California").
-- The old `city` column is kept (no data is deleted) but no longer edited.
-- Safe to run more than once.
-- =====================================================================

alter table public.profiles
  add column if not exists region text check (char_length(region) <= 80);

-- Let users edit it (same column-level rule as the other profile fields).
grant update (region) on public.profiles to authenticated;

-- Expose it on the public host listing (new column appended at the end).
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
  p.region
from public.host_profiles hp
join public.profiles p on p.id = hp.user_id
where hp.is_published and p.role = 'host';

revoke all on public.public_hosts from anon, authenticated;
grant select on public.public_hosts to anon, authenticated;
