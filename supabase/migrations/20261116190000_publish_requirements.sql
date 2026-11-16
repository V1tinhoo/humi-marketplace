-- =====================================================================
-- HUMI · Requirements before a host profile goes public
-- A host can only be listed in Explore (is_published = true) with:
--   * a tagline AND a description
--   * at least one session category
--   * weekly availability (at least one window)
--   * a profile photo
-- Checked by the database whenever a profile is being published, so it
-- holds for the dashboard, the admin and SQL scripts alike. Profiles that
-- are already public stay public; the rule applies when publishing.
-- Safe to run more than once.
-- =====================================================================

create or replace function public.host_publish_missing(p_host_id uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when coalesce(btrim(h.tagline), '') = '' or coalesce(btrim(h.description), '') = '' then 'tagline_description' end,
    case when coalesce(cardinality(h.categories), 0) = 0 then 'category' end,
    case when not exists (select 1 from public.host_availability a where a.host_id = h.id) then 'availability' end,
    case when coalesce(p.avatar_url, '') = '' then 'photo' end
  ], null)
  from public.host_profiles h
  join public.profiles p on p.id = h.user_id
  where h.id = p_host_id
$$;

create or replace function public.host_profiles_publish_check()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_missing text[];
begin
  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    -- Checked against the row as it will be saved (tagline/description/categories may change in the same update).
    select array_remove(array[
      case when coalesce(btrim(new.tagline), '') = '' or coalesce(btrim(new.description), '') = '' then 'tagline_description' end,
      case when coalesce(cardinality(new.categories), 0) = 0 then 'category' end,
      case when not exists (select 1 from public.host_availability a where a.host_id = new.id) then 'availability' end,
      case when coalesce((select p.avatar_url from public.profiles p where p.id = new.user_id), '') = '' then 'photo' end
    ], null) into v_missing;
    if cardinality(v_missing) > 0 then
      raise exception 'Complete your profile before publishing.'
        using errcode = 'P0001', hint = 'profile_incomplete', detail = array_to_string(v_missing, ',');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists host_profiles_publish_check on public.host_profiles;
create trigger host_profiles_publish_check
  before insert or update of is_published, tagline, description, categories on public.host_profiles
  for each row execute function public.host_profiles_publish_check();

revoke execute on function public.host_profiles_publish_check() from public, anon, authenticated;
revoke execute on function public.host_publish_missing(uuid) from public, anon;
grant execute on function public.host_publish_missing(uuid) to authenticated;

notify pgrst, 'reload schema';
