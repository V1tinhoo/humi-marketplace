-- =====================================================================
-- HUMI — keep the platform commission private
-- The commission rate and per-call platform amounts are no longer readable
-- by customers or hosts through the API (only admins / the server).
-- Hosts still see what THEY earn; customers see what THEY paid.
-- Billing itself is unchanged. Safe to run more than once.
-- =====================================================================

-- Settings: everything public except the commission rate.
drop policy if exists "settings: public read" on public.platform_settings;
drop policy if exists "settings: public read (no commission)" on public.platform_settings;
create policy "settings: public read (no commission)" on public.platform_settings for select to anon, authenticated
  using (key <> 'commission_bps' or public.is_admin());

-- Raw call rows and per-tick billing records carry the split: admin/server only.
drop policy if exists "calls: participants" on public.call_sessions;
drop policy if exists "calls: admin" on public.call_sessions;
create policy "calls: admin" on public.call_sessions for select to authenticated using (public.is_admin());

drop policy if exists "billing: participants" on public.call_billing_records;
drop policy if exists "billing: admin" on public.call_billing_records;
create policy "billing: admin" on public.call_billing_records for select to authenticated using (public.is_admin());

-- Participants read calls through this view: no commission rate, no platform amount,
-- and host earnings only for the host.
drop view if exists public.my_calls;
create view public.my_calls as
select cs.id, cs.booking_id, cs.host_id, cs.call_type, cs.price_cents_per_minute, cs.room_name, cs.status,
       cs.end_reason, cs.livemode, cs.created_at, cs.connected_at, cs.ended_at, cs.billed_seconds, cs.charged_cents,
       case when hp.user_id = auth.uid() then cs.host_earnings_cents end as host_earnings_cents,
       split_part(p.full_name, ' ', 1) as customer_name,
       hp.display_name as host_name,
       (hp.user_id = auth.uid()) as i_am_host
from public.call_sessions cs
join public.profiles p on p.id = cs.customer_id
join public.host_profiles hp on hp.id = cs.host_id
where cs.customer_id = auth.uid() or hp.user_id = auth.uid();

drop view if exists public.my_host_earnings_summary;
create view public.my_host_earnings_summary as
select hp.id as host_id,
       coalesce(sum(e.amount_cents) filter (where e.kind = 'call'), 0)        as total_earned_cents,
       coalesce(sum(e.amount_cents) filter (where e.available_at <= now()), 0) as available_cents,
       coalesce(sum(e.amount_cents) filter (where e.available_at > now()), 0)  as pending_cents,
       (select count(*) from public.call_sessions cs where cs.host_id = hp.id and cs.billed_seconds > 0)  as calls_count,
       (select coalesce(sum(cs.billed_seconds), 0) from public.call_sessions cs where cs.host_id = hp.id) as billed_seconds
from public.host_profiles hp
left join public.host_earnings e on e.host_id = hp.id
where hp.user_id = auth.uid()
group by hp.id;

revoke all on public.my_calls, public.my_host_earnings_summary from anon, authenticated;
grant select on public.my_calls, public.my_host_earnings_summary to authenticated;

-- Lets a host preview what they'd receive per minute for a price, without exposing the rate.
create or replace function public.host_net_cents(p_price_cents integer)
returns integer language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.host_profiles where user_id = auth.uid()) then
    raise exception 'Only hosts can preview earnings.' using errcode = '42501';
  end if;
  return floor(p_price_cents::numeric * (10000 - public.setting('commission_bps')) / 10000);
end $$;

revoke execute on function public.host_net_cents(integer) from public, anon;
grant execute on function public.host_net_cents(integer) to authenticated;
