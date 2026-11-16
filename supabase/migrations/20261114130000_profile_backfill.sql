-- =====================================================================
-- HUMI — profile safety net
-- Accounts created before the initial migration (or if the sign-up
-- trigger was missing) have no row in public.profiles. This:
--   1. backfills missing profiles / host profiles,
--   2. adds ensure_profile() so the app can self-heal on login,
--   3. makes become_host() create the profile if it's missing.
-- Safe to run more than once.
-- =====================================================================

-- 1. Backfill
insert into public.profiles (id, full_name, role)
select u.id,
       left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(u.email, ''), '@', 1)), 80),
       case when u.raw_user_meta_data ->> 'role' = 'host' then 'host'::public.user_role else 'customer'::public.user_role end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

insert into public.host_profiles (user_id, display_name)
select p.id, left(coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'Host'), 40)
from public.profiles p
where p.role = 'host'
  and not exists (select 1 from public.host_profiles hp where hp.user_id = p.id);

-- 2. Self-healing helper for the signed-in user
create or replace function public.ensure_profile()
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v public.profiles;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  insert into public.profiles (id, full_name, role)
  select u.id,
         left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(u.email, ''), '@', 1)), 80),
         case when u.raw_user_meta_data ->> 'role' = 'host' then 'host'::public.user_role else 'customer'::public.user_role end
  from auth.users u
  where u.id = v_uid
  on conflict (id) do nothing;

  select * into v from public.profiles where id = v_uid;

  if v.role = 'host' then
    insert into public.host_profiles (user_id, display_name)
    values (v_uid, left(coalesce(nullif(split_part(v.full_name, ' ', 1), ''), 'Host'), 40))
    on conflict (user_id) do nothing;
  end if;

  return v;
end $$;

-- 3. become_host now works even if the profile row was missing
create or replace function public.become_host()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  perform public.ensure_profile();
  update public.profiles set role = 'host' where id = v_uid and role = 'customer';
  insert into public.host_profiles (user_id, display_name)
  select p.id, left(coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'Host'), 40) from public.profiles p where p.id = v_uid
  on conflict (user_id) do nothing;
  select id into v_id from public.host_profiles where user_id = v_uid;
  return v_id;
end $$;

revoke execute on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;
revoke execute on function public.become_host() from public, anon;
grant execute on function public.become_host() to authenticated;
