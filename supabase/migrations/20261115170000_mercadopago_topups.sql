-- =====================================================================
-- HUMI · Mercado Pago top-ups
-- Top-ups from the Mercado Pago SANDBOX (test credentials) must be test balance, not real money.
-- Before: livemode = provider <> 'test'. Now: real money only for real providers.
-- Safe to run more than once.
-- =====================================================================
create or replace function public.create_topup(p_amount_cents bigint, p_provider text, p_method text)
returns public.wallet_topups language plpgsql security definer set search_path = '' as $$
declare v public.wallet_topups;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_provider not in ('test', 'mercadopago', 'mercadopago_sandbox') then
    raise exception 'Unknown payment provider.' using errcode = 'P0001';
  end if;
  if p_amount_cents < public.setting('topup_min_cents') or p_amount_cents > public.setting('topup_max_cents') then
    raise exception 'Top-up must be between % and % cents.', public.setting('topup_min_cents'), public.setting('topup_max_cents')
      using errcode = 'P0001', hint = 'topup_out_of_range';
  end if;
  insert into public.wallets (user_id) values (auth.uid()) on conflict do nothing;
  insert into public.wallet_topups (user_id, amount_cents, provider, method, livemode)
  values (auth.uid(), p_amount_cents, p_provider, p_method, p_provider = 'mercadopago')
  returning * into v;
  return v;
end $$;

notify pgrst, 'reload schema';
