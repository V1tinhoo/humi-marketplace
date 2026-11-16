-- =====================================================================
-- Wallet activity: one line per call.
-- Calls are billed every few seconds, so a 20-minute call writes hundreds
-- of ledger rows. The wallet page read the newest 100 raw rows, so long
-- calls pushed older calls and top-ups out of the list and showed only
-- part of the call's total. This view groups each call's charges into a
-- single row (total, final balance, end time). RLS of wallet_transactions
-- still applies (security_invoker).
-- =====================================================================

create or replace view public.my_wallet_activity with (security_invoker = true) as
select (array_agg(t.id order by t.created_at desc, t.id desc))[1]                  as id,
       t.user_id,
       'call_charge'::text                                                          as kind,
       sum(t.amount_cents)::bigint                                                  as amount_cents,
       (array_agg(t.balance_after_cents order by t.created_at desc, t.id desc))[1]  as balance_after_cents,
       t.reference_id,
       t.livemode,
       'Call charge'::text                                                          as description,
       max(t.created_at)                                                            as created_at
from public.wallet_transactions t
where t.kind = 'call_charge' and t.reference_id is not null
group by t.user_id, t.reference_id, t.livemode
union all
select t.id, t.user_id, t.kind::text, t.amount_cents, t.balance_after_cents, t.reference_id, t.livemode, t.description, t.created_at
from public.wallet_transactions t
where not (t.kind = 'call_charge' and t.reference_id is not null);

revoke all on public.my_wallet_activity from anon, authenticated;
grant select on public.my_wallet_activity to authenticated;

notify pgrst, 'reload schema';
