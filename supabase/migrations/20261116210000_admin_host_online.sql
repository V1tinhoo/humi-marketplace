-- =====================================================================
-- HUMI · Admin: switch a host's "Online now" on or off
--   * Off: the host goes offline right away (e.g. forgot it switched on).
--   * On:  switches the host's "Online now" on; they show as online as soon
--          as they have the site open.
-- Every change is logged in the admin activity log.
--
-- 20261116220000_force_online.sql installs newer versions of these two
-- functions. If it already ran, this migration changes nothing, so the two
-- can be run in any order. Safe to run more than once.
-- =====================================================================

do $migration$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'host_profiles' and column_name = 'forced_online_until') then
    raise notice 'Newer version (20261116220000_force_online) already installed: nothing to do.';
    return;
  end if;

  execute $fn$
    create or replace function public.admin_set_host_available(p_host_id uuid, p_on boolean)
    returns void language plpgsql security definer set search_path = '' as $body$
    begin
      perform public.assert_admin();
      update public.host_profiles set is_available = coalesce(p_on, false), updated_at = now() where id = p_host_id;
      if not found then raise exception 'Host not found.' using errcode = 'P0001'; end if;
      perform public.admin_log(case when p_on then 'host_available_on' else 'host_available_off' end, p_host_id::text);
    end $body$;
  $fn$;

  -- Presence of every host for the admin list: switch state and whether they are really online now.
  execute $fn$
    create or replace function public.admin_hosts_presence()
    returns table (host_id uuid, is_available boolean, is_online boolean, last_seen_at timestamptz)
    language plpgsql stable security definer set search_path = '' as $body$
    begin
      perform public.assert_admin();
      return query
        select h.id, h.is_available,
               coalesce(h.is_available and h.last_seen_at > now() - interval '90 seconds', false),
               h.last_seen_at
        from public.host_profiles h;
    end $body$;
  $fn$;

  revoke execute on function public.admin_set_host_available(uuid, boolean), public.admin_hosts_presence() from public, anon;
  grant execute on function public.admin_set_host_available(uuid, boolean), public.admin_hosts_presence() to authenticated;
end $migration$;

notify pgrst, 'reload schema';
