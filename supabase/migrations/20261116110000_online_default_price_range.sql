-- =====================================================================
-- HUMI · "Online now" on by default + faster offline + price range R$ 1–5/min
--   * New hosts start with "Online now" switched ON (they can switch it off).
--   * Online = switch ON and a heartbeat in the last 90 s (was 3 min). The site also
--     tells the server right away when the host closes the tab.
--   * Price per minute limited to R$ 1,00 – R$ 5,00; prices outside are clamped.
-- Safe to run more than once.
-- =====================================================================

alter table public.host_profiles alter column is_available set default true;
-- Hosts who never touched the switch (everyone so far) get it ON.
update public.host_profiles set is_available = true where not is_available;

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
where hp.is_published and p.role = 'host';

update public.platform_settings set value = 100 where key = 'price_min_cents_per_minute';
update public.platform_settings set value = 500 where key = 'price_max_cents_per_minute';

update public.host_pricing set
  audio_cents_per_minute = least(500, greatest(100, audio_cents_per_minute)),
  video_cents_per_minute = case when video_cents_per_minute is null then null else least(500, greatest(100, video_cents_per_minute)) end
where audio_cents_per_minute not between 100 and 500
   or (video_cents_per_minute is not null and video_cents_per_minute not between 100 and 500);

notify pgrst, 'reload schema';
