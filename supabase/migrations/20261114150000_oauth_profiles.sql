-- =====================================================================
-- HUMI — social sign-in (Google / Apple) profile support
-- OAuth users arrive with provider metadata instead of our sign-up form:
--   Google: full_name / name, avatar_url / picture, email
--   Apple:  usually only email (name only on the very first consent)
-- This makes profile creation read those fields, and lets ensure_profile()
-- fill in a missing name/photo later WITHOUT overwriting user edits or
-- changing the role. Safe to run more than once.
-- =====================================================================

create or replace function public.profile_name_from_meta(meta jsonb, email text)
returns text language sql immutable set search_path = '' as $$
  select left(coalesce(
    nullif(trim(meta ->> 'full_name'), ''),
    nullif(trim(meta ->> 'name'), ''),
    nullif(trim(concat_ws(' ', meta ->> 'given_name', meta ->> 'family_name')), ''),
    nullif(split_part(coalesce(email, ''), '@', 1), ''),
    'Member'
  ), 80);
$$;

create or replace function public.profile_avatar_from_meta(meta jsonb)
returns text language sql immutable set search_path = '' as $$
  select case
    when coalesce(meta ->> 'avatar_url', meta ->> 'picture') ~ '^https://' then coalesce(meta ->> 'avatar_url', meta ->> 'picture')
  end;
$$;

-- New users: role only from our own sign-up form ('host'), never 'admin'; OAuth users start as customers.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := case when new.raw_user_meta_data ->> 'role' = 'host' then 'host' else 'customer' end;
  v_name text := public.profile_name_from_meta(new.raw_user_meta_data, new.email);
begin
  insert into public.profiles (id, full_name, avatar_url, role)
  values (new.id, v_name, public.profile_avatar_from_meta(new.raw_user_meta_data), v_role)
  on conflict (id) do nothing;
  if v_role = 'host' then
    insert into public.host_profiles (user_id, display_name)
    values (new.id, left(coalesce(nullif(split_part(v_name, ' ', 1), ''), 'Host'), 40))
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

-- Called after every sign-in: creates the profile if missing, otherwise only fills EMPTY name/photo.
create or replace function public.ensure_profile()
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  u auth.users;
  v public.profiles;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into u from auth.users where id = v_uid;

  insert into public.profiles (id, full_name, avatar_url, role)
  values (
    v_uid,
    public.profile_name_from_meta(u.raw_user_meta_data, u.email),
    public.profile_avatar_from_meta(u.raw_user_meta_data),
    case when u.raw_user_meta_data ->> 'role' = 'host' then 'host'::public.user_role else 'customer'::public.user_role end
  )
  on conflict (id) do update set
    full_name  = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end,
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
    -- role is never touched here

  select * into v from public.profiles where id = v_uid;
  if v.role = 'host' then
    insert into public.host_profiles (user_id, display_name)
    values (v_uid, left(coalesce(nullif(split_part(v.full_name, ' ', 1), ''), 'Host'), 40))
    on conflict (user_id) do nothing;
  end if;
  return v;
end $$;

revoke execute on function public.profile_name_from_meta(jsonb, text) from public, anon, authenticated;
revoke execute on function public.profile_avatar_from_meta(jsonb) from public, anon, authenticated;
revoke execute on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;
