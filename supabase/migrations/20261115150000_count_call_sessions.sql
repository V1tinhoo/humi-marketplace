-- =====================================================================
-- HUMI — session count follows real calls
-- Before: host_profiles.total_sessions only grew when a booking was marked
-- "completed" (old fixed-price model), so per-minute calls never counted.
-- Now: every call that actually happened (time was billed) counts once,
-- when it ends. Old completed bookings without a call still count.
-- Safe to run more than once.
-- =====================================================================

-- Bookings no longer increment the counter (a booking leads to a call, which is what counts).
create or replace function public.bookings_after_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  return new;
end $$;

create or replace function public.call_sessions_count_session()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'ended' and old.status is distinct from 'ended' and new.billed_seconds > 0 then
    update public.host_profiles set total_sessions = total_sessions + 1 where id = new.host_id;
  end if;
  return new;
end $$;

drop trigger if exists call_sessions_count_session on public.call_sessions;
create trigger call_sessions_count_session after update of status on public.call_sessions
  for each row execute function public.call_sessions_count_session();

revoke execute on function public.call_sessions_count_session() from public, anon, authenticated;

-- Recount everything already in the database.
update public.host_profiles hp set total_sessions =
    (select count(*) from public.call_sessions c where c.host_id = hp.id and c.status = 'ended' and c.billed_seconds > 0)
  + (select count(*) from public.bookings b where b.host_id = hp.id and b.status = 'completed'
       and not exists (select 1 from public.call_sessions c where c.booking_id = b.id and c.billed_seconds > 0));
