-- =====================================================================
-- HUMI · Lower starting prices for new hosts
-- New host profiles start at R$ 0,50/min (audio) and R$ 0,70/min (video),
-- instead of R$ 1,00 / R$ 1,20. Hosts can change it any time in the
-- dashboard. Prices that hosts already have are not changed.
-- Safe to run more than once.
-- =====================================================================

alter table public.host_pricing alter column audio_cents_per_minute set default 50;

create or replace function public.host_profiles_create_pricing()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.host_pricing (host_id, audio_cents_per_minute, video_cents_per_minute) values (new.id, 50, 70)
  on conflict do nothing;
  return new;
end $$;

revoke execute on function public.host_profiles_create_pricing() from public, anon, authenticated;

notify pgrst, 'reload schema';
