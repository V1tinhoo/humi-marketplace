-- =====================================================================
-- HUMI · Host withdrawals (saque)
--   * Hosts save a Pix key and request a withdrawal.
--   * Only earnings from calls paid with REAL money, after the holding period, can be withdrawn.
--     Wallet money (top-ups) is never withdrawable: it isn't host earnings at all.
--   * A request immediately reserves the amount (negative 'payout' entry), so it can't be
--     requested twice. The HUMI team pays by Pix and marks it paid; failed/canceled → amount returns.
-- Safe to run more than once.
-- =====================================================================

alter table public.payout_accounts add column if not exists pix_key_type text;
alter table public.payout_accounts drop constraint if exists payout_accounts_pix_key_type_check;
alter table public.payout_accounts add constraint payout_accounts_pix_key_type_check
  check (pix_key_type is null or pix_key_type in ('cpf', 'cnpj', 'email', 'phone', 'random'));

insert into public.platform_settings (key, value, description) values
  ('payout_min_cents', 1000, 'Minimum withdrawal (cents).')
on conflict (key) do nothing;

-- Real, already-available call earnings minus reserved/paid withdrawals.
create or replace function public.host_available_cents(p_host_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_cents), 0)
  from public.host_earnings
  where host_id = p_host_id and livemode and available_at <= now();
$$;

-- Host saves where to receive (Pix key). Validated loosely; the team checks before paying.
create or replace function public.set_payout_pix_key(p_key_type text, p_key text)
returns public.payout_accounts language plpgsql security definer set search_path = '' as $$
declare
  v_host uuid;
  v_key text := btrim(coalesce(p_key, ''));
  v public.payout_accounts;
begin
  select id into v_host from public.host_profiles where user_id = auth.uid();
  if v_host is null then raise exception 'Only hosts can set a payout key.' using errcode = '42501'; end if;
  if p_key_type not in ('cpf', 'cnpj', 'email', 'phone', 'random') then raise exception 'Choose the Pix key type.' using errcode = 'P0001'; end if;
  if char_length(v_key) < 5 or char_length(v_key) > 100 then raise exception 'Enter a valid Pix key.' using errcode = 'P0001'; end if;
  if p_key_type = 'email' and v_key !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid Pix key.' using errcode = 'P0001'; end if;
  if p_key_type in ('cpf', 'cnpj', 'phone') then
    v_key := regexp_replace(v_key, '[^0-9+]', '', 'g');
    if (p_key_type = 'cpf' and char_length(v_key) <> 11) or (p_key_type = 'cnpj' and char_length(v_key) <> 14) then
      raise exception 'Enter a valid Pix key.' using errcode = 'P0001';
    end if;
  end if;
  insert into public.payout_accounts (host_id, provider, provider_account_id, pix_key_type, status, updated_at)
  values (v_host, 'pix_manual', v_key, p_key_type, 'active', now())
  on conflict (host_id) do update set provider = 'pix_manual', provider_account_id = excluded.provider_account_id,
    pix_key_type = excluded.pix_key_type, status = 'active', updated_at = now()
  returning * into v;
  return v;
end $$;

-- Host asks to withdraw. Reserves the amount right away.
create or replace function public.request_payout(p_amount_cents bigint)
returns public.payout_records language plpgsql security definer set search_path = '' as $$
declare
  v_host uuid;
  v_acc public.payout_accounts;
  v_available bigint;
  v_min bigint := coalesce(public.setting('payout_min_cents'), 1000);
  v public.payout_records;
begin
  select id into v_host from public.host_profiles where user_id = auth.uid();
  if v_host is null then raise exception 'Only hosts can withdraw.' using errcode = '42501'; end if;
  -- One request at a time per host (also serialises concurrent clicks).
  perform 1 from public.host_profiles where id = v_host for update;
  select * into v_acc from public.payout_accounts where host_id = v_host;
  if v_acc.provider_account_id is null or v_acc.status <> 'active' then
    raise exception 'Add your Pix key first.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payout_records where host_id = v_host and status in ('requested', 'processing')) then
    raise exception 'You already have a withdrawal in progress.' using errcode = 'P0001';
  end if;
  if p_amount_cents is null or p_amount_cents < v_min then
    raise exception 'The minimum withdrawal is % cents.', v_min using errcode = 'P0001';
  end if;
  v_available := public.host_available_cents(v_host);
  if p_amount_cents > v_available then
    raise exception 'You can withdraw up to % cents right now.', v_available using errcode = 'P0001';
  end if;

  insert into public.payout_records (host_id, amount_cents, status, provider, provider_payout_id, livemode)
  values (v_host, p_amount_cents, 'requested', 'pix_manual', v_acc.pix_key_type || ':' || v_acc.provider_account_id, true)
  returning * into v;
  insert into public.host_earnings (host_id, kind, amount_cents, payout_id, available_at, livemode, idempotency_key)
  values (v_host, 'payout', -p_amount_cents, v.id, now(), true, 'payout:' || v.id);
  return v;
end $$;

-- Gives a reserved amount back (failed/canceled withdrawal). Internal helper.
create or replace function public.payout_release(p_payout public.payout_records)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.host_earnings (host_id, kind, amount_cents, payout_id, available_at, livemode, idempotency_key)
  values (p_payout.host_id, 'adjustment', p_payout.amount_cents, p_payout.id, now(), true, 'payout-release:' || p_payout.id)
  on conflict (idempotency_key) do nothing;
end $$;

-- Host cancels their own request while the team hasn't started paying it.
create or replace function public.cancel_payout(p_payout_id uuid)
returns public.payout_records language plpgsql security definer set search_path = '' as $$
declare v public.payout_records;
begin
  select pr.* into v from public.payout_records pr
  join public.host_profiles hp on hp.id = pr.host_id
  where pr.id = p_payout_id and hp.user_id = auth.uid() for update of pr;
  if not found then raise exception 'Withdrawal not found.' using errcode = 'P0001'; end if;
  if v.status <> 'requested' then raise exception 'This withdrawal can no longer be canceled.' using errcode = 'P0001'; end if;
  update public.payout_records set status = 'canceled', updated_at = now() where id = v.id returning * into v;
  perform public.payout_release(v);
  return v;
end $$;

-- HUMI team (admin, or the SQL editor) moves a withdrawal along:
--   select public.admin_update_payout('<payout id>', 'paid');      -- after sending the Pix
--   select public.admin_update_payout('<payout id>', 'failed');    -- money goes back to the host
create or replace function public.admin_update_payout(p_payout_id uuid, p_status public.payout_status)
returns public.payout_records language plpgsql security definer set search_path = '' as $$
declare v public.payout_records;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Not allowed.' using errcode = '42501'; end if;
  select * into v from public.payout_records where id = p_payout_id for update;
  if not found then raise exception 'Withdrawal not found.' using errcode = 'P0001'; end if;
  if v.status in ('paid', 'failed', 'canceled') then raise exception 'This withdrawal is already %.', v.status using errcode = 'P0001'; end if;
  update public.payout_records set status = p_status, updated_at = now() where id = v.id returning * into v;
  if p_status in ('failed', 'canceled') then perform public.payout_release(v); end if;
  return v;
end $$;

-- What the team needs to pay: open requests with the host's Pix key.
create or replace view public.admin_payout_requests as
select pr.id, pr.created_at, pr.status, pr.amount_cents, hp.display_name, p.full_name,
       pa.pix_key_type, pa.provider_account_id as pix_key
from public.payout_records pr
join public.host_profiles hp on hp.id = pr.host_id
join public.profiles p on p.id = hp.user_id
left join public.payout_accounts pa on pa.host_id = pr.host_id
where public.is_admin() or auth.uid() is null
order by pr.created_at;

revoke all on public.admin_payout_requests from anon;
revoke execute on function public.host_available_cents(uuid), public.payout_release(public.payout_records) from public, anon, authenticated;
revoke execute on function public.set_payout_pix_key(text, text), public.request_payout(bigint), public.cancel_payout(uuid), public.admin_update_payout(uuid, public.payout_status) from public, anon;
grant execute on function public.set_payout_pix_key(text, text), public.request_payout(bigint), public.cancel_payout(uuid), public.admin_update_payout(uuid, public.payout_status) to authenticated;
-- Hosts never write payout tables directly.
revoke insert, update, delete on public.payout_accounts, public.payout_records from anon, authenticated;

notify pgrst, 'reload schema';
