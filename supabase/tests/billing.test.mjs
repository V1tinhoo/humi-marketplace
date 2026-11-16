// HUMI per-minute billing: the 15 required scenarios + security checks.
// Time passing is simulated by moving the call's timestamps back (as the DB owner);
// billing itself only ever uses the database clock.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const db = new PGlite({ extensions: { btree_gist } });
let fail = 0;
const check = (n, c, i) => { console.log(c ? "  PASS" : "  FAIL", n, c ? "" : JSON.stringify(i ?? "")); if (!c) fail++; };
const run = (role, uid, sql, params = []) => db.transaction(async (t) => {
  await t.exec(`set local role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', true);`);
  return t.query(sql, params);
});
const as = (uid, sql, params) => run("authenticated", uid, sql, params);
const svc = (sql, params) => run("service_role", null, sql, params);
const attempt = (p) => p.then((r) => ({ ok: true, rows: r.rows }), (e) => ({ ok: false, error: e.message }));
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);
for (const f of files) await db.exec(readFileSync(f, "utf8"));

const user = async (email, meta) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).id;
const hostUser = await user("host@x.com", { full_name: "Hana Host", role: "host" });
const host2User = await user("host2@x.com", { full_name: "Ivo Host", role: "host" });
const ana = await user("ana@x.com", { full_name: "Ana" });
const bia = await user("bia@x.com", { full_name: "Bia" });
const cai = await user("cai@x.com", { full_name: "Cai" });
const hostId = (await one(`update public.host_profiles set is_published=true where user_id=$1 returning id`, [hostUser])).id;
const host2Id = (await one(`update public.host_profiles set is_published=true where user_id=$1 returning id`, [host2User])).id;

const balance = async (uid) => Number((await one(`select coalesce((select balance_cents from public.wallets where user_id=$1),0) b`, [uid])).b);
const topup = async (uid, cents) => {
  const t = (await as(uid, `select * from public.create_topup($1,'test','pix')`, [cents])).rows[0];
  return t;
};
const approve = (t, providerId = "test_" + t.id.slice(0, 8), amount = t.amount_cents) =>
  svc(`select * from public.confirm_topup($1,'test',$2,$3,'approved','pix')`, [t.id, providerId, amount]);
const start = (uid, h = hostId, type = "audio") => attempt(as(uid, `select * from public.start_call($1,$2)`, [h, type]));
const tick = async (callId, connected) => (await svc(`select * from public.call_tick($1,$2)`, [callId, connected])).rows[0];
const elapse = (callId, secs) => db.query(
  `update public.call_sessions set created_at = created_at - make_interval(secs => $2), last_connected_at = last_connected_at - make_interval(secs => $2) where id=$1`, [callId, secs]);
/** Simulates `seconds` of connected call in steps of `step` (server checks both are in the room each step). */
const talk = async (callId, seconds, step = 30) => { let c; for (let s = 0; s < seconds; s += step) { await elapse(callId, Math.min(step, seconds - s)); c = await tick(callId, true); if (c.status !== "connected") break; } return c; };

console.log("\nPricing (server-validated)");
check("host price below minimum rejected", !(await attempt(as(hostUser, `select public.set_host_pricing(10, null)`))).ok);
check("host sets R$ 1,00/min audio, R$ 1,50/min video", (await attempt(as(hostUser, `select public.set_host_pricing(100, 150)`))).ok);
check("customer cannot set a host price", !(await attempt(as(ana, `select public.set_host_pricing(100, 100)`))).ok);
check("nobody can write host_pricing directly", !(await attempt(as(hostUser, `update public.host_pricing set audio_cents_per_minute=1`))).ok);
check("public listing shows price per minute", Number((await attempt(run("anon", null, `select audio_cents_per_minute a from public.public_hosts where id=$1`, [hostId]))).rows[0].a) === 100);

console.log("\n1 + 12. Top-up R$ 50, confirmed only by webhook, never twice");
const t50 = await topup(ana, 5000);
check("top-up starts pending, balance still 0", t50.status === "pending" && (await balance(ana)) === 0);
check("customer cannot confirm their own top-up", !(await attempt(as(ana, `select public.confirm_topup($1,'test','x',5000,'approved')`, [t50.id]))).ok);
check("webhook with wrong amount rejected", !(await attempt(svc(`select public.confirm_topup($1,'test','x',9999,'approved')`, [t50.id]))).ok);
await approve(t50);
check("after confirmation balance is exactly R$ 50,00", (await balance(ana)) === 5000);
await approve(t50); await approve(t50);
check("duplicate webhooks don't credit again", (await balance(ana)) === 5000 && Number((await one(`select count(*) c from public.wallet_transactions where reference_id=$1`, [t50.id])).c) === 1);
const tDecl = await topup(ana, 2000);
await svc(`select public.confirm_topup($1,'test','decl',2000,'declined','card','insufficient funds')`, [tDecl.id]);
check("declined top-up credits nothing", (await balance(ana)) === 5000);
check("top-up below the minimum rejected", !(await attempt(as(ana, `select public.create_topup(100,'test','pix')`))).ok);
check("customer cannot edit the wallet directly", !(await attempt(as(ana, `update public.wallets set balance_cents=999999 where user_id=$1`, [ana]))).ok);

console.log("\n3. Start without enough balance");
const noMoney = await start(bia);
check("rejected with insufficient_balance", !noMoney.ok && /Add at least/.test(noMoney.error), noMoney);

console.log("\n9. Call that never connects is never charged");
const fc = (await start(ana)).rows[0];
await elapse(fc.id, 100);
const failed = await tick(fc.id, false);
check("fails after ring timeout, R$ 0 charged", failed.status === "failed" && failed.end_reason === "failed_to_connect" && Number(failed.charged_cents) === 0 && (await balance(ana)) === 5000);

console.log("\n2 + 4 + 5 + 6. 10-minute call at R$ 1,00/min, customer hangs up");
const c1 = (await start(ana)).rows[0];
check("call starts with enough balance (ringing, nothing charged)", c1.status === "ringing" && (await balance(ana)) === 5000);
let s = await tick(c1.id, true);
check("connects when the server confirms both are in the room", s.status === "connected" && Number(s.charged_cents) === 0);
s = await talk(c1.id, 600);
check("10 minutes billed = 600 s", s.billed_seconds === 600, s.billed_seconds);
check("customer charged R$ 10,00", Number(s.charged_cents) === 1000, s.charged_cents);
check("host gets 75% = R$ 7,50", Number(s.host_earnings_cents) === 750, s.host_earnings_cents);
check("HUMI gets 25% = R$ 2,50", Number(s.platform_fee_cents) === 250, s.platform_fee_cents);
check("wallet = R$ 40,00", (await balance(ana)) === 4000);
const end1 = (await svc(`select * from public.finish_call($1,'customer_hangup')`, [c1.id])).rows[0];
check("customer hangs up → ended", end1.status === "ended" && end1.end_reason === "customer_hangup");
await elapse(c1.id, 30);
check("ticks after the end charge nothing", Number((await tick(c1.id, true)).charged_cents) === 1000 && (await balance(ana)) === 4000);

console.log("\nPer-second billing (no full minute for a few seconds)");
const ps = (await start(ana)).rows[0];
await tick(ps.id, true);
const ps2 = await talk(ps.id, 15, 15);
check("15 s at R$ 1,00/min = R$ 0,25", Number(ps2.charged_cents) === 25, ps2.charged_cents);

console.log("\n7. Host hangs up");
const end2 = (await svc(`select * from public.finish_call($1,'host_hangup')`, [ps.id])).rows[0];
check("host hangs up → ended", end2.status === "ended" && end2.end_reason === "host_hangup");

console.log("\n8. Connection drops unexpectedly");
const c3 = (await start(ana)).rows[0];
await tick(c3.id, true);
await talk(c3.id, 60);
const before = Number((await one(`select charged_cents from public.call_sessions where id=$1`, [c3.id])).charged_cents);
await elapse(c3.id, 20);
const blip = await tick(c3.id, false);
check("short drop (within grace) keeps the call", blip.status === "connected");
await elapse(c3.id, 40);
const dropped = await tick(c3.id, false);
check("drop longer than the grace period ends the call", dropped.status === "ended" && dropped.end_reason === "dropped");
check("time while disconnected is not charged", Number(dropped.charged_cents) === before, [before, dropped.charged_cents]);

console.log("\n13. Frontend can't manipulate time or amounts");
check("clients cannot run billing ticks", !(await attempt(as(ana, `select public.call_tick($1,true)`, [c3.id]))).ok);
check("clients cannot end calls with a fake reason directly", !(await attempt(as(ana, `select public.finish_call($1,'x')`, [c3.id]))).ok);
check("clients cannot edit call sessions", !(await attempt(as(ana, `update public.call_sessions set billed_seconds=0, charged_cents=0 where id=$1`, [c3.id]))).ok);
const c4 = (await start(ana)).rows[0];
await tick(c4.id, true);
await elapse(c4.id, 1000);
const gap = await tick(c4.id, true);
check("a huge gap between checks is never billed (only ≤ grace)", Number(gap.charged_cents) === 0 && gap.billed_seconds === 0, gap);
const twice = await talk(c4.id, 30, 30);
const again = await tick(c4.id, true);
check("two checks at the same moment don't double-charge", Number(again.charged_cents) === Number(twice.charged_cents));
await svc(`select public.finish_call($1,'customer_hangup')`, [c4.id]);

console.log("\n10 + 11. Balance runs out; top-up during a call");
const tCai = await topup(cai, 1000); await approve(tCai);           // R$ 10
await as(hostUser, `select public.set_host_pricing(500, 600)`);       // R$ 5,00/min
const c5 = (await start(cai)).rows[0];
await tick(c5.id, true);
let r5 = await talk(c5.id, 60);
check("after 1 min at R$ 5/min: R$ 5 left", (await balance(cai)) === 500, await balance(cai));
const tMid = await topup(cai, 1000); await approve(tMid);             // top-up mid-call
check("top-up during the call lands immediately (R$ 15)", (await balance(cai)) === 1500);
r5 = await talk(c5.id, 600);
check("call ends by itself when the money runs out", r5.status === "ended" && r5.end_reason === "insufficient_funds", r5);
check("wallet ends at exactly R$ 0,00 (never negative)", (await balance(cai)) === 0);
check("charged exactly what was available (R$ 20)", Number(r5.charged_cents) === 2000, r5.charged_cents);
await as(hostUser, `select public.set_host_pricing(100, 150)`);

console.log("\n14. Competing debits can't make the balance negative");
const tB = await topup(bia, 1000); await approve(tB);                 // R$ 10
const cB = (await start(bia, host2Id)).rows[0];
await tick(cB.id, true);
await talk(cB.id, 300);                                               // spends R$ 5 (host2 default R$ 1/min)
const refund = await attempt(svc(`select public.confirm_topup($1,'test',null,1000,'refunded')`, [tB.id]));
check("refunding a top-up that was partly spent is refused", !refund.ok, refund);
check("balance stays ≥ 0", (await balance(bia)) >= 0, await balance(bia));
const neg = await attempt(db.query(`update public.wallets set balance_cents = -1 where user_id=$1`, [bia]));
check("database constraint blocks a negative balance even for admins", !neg.ok);
await svc(`select public.finish_call($1,'customer_hangup')`, [cB.id]);
check("one active call per customer (a second start is refused)", await (async () => {
  const a = (await start(bia, hostId)).rows[0]; const b = await start(bia, host2Id);
  await svc(`select public.finish_call($1,'customer_hangup')`, [a.id]); return !b.ok;
})());

console.log("\n15. Ledger, wallets and earnings reconcile");
for (const [name, uid] of [["Ana", ana], ["Bia", bia], ["Cai", cai]]) {
  const sum = Number((await one(`select coalesce(sum(amount_cents),0) s from public.wallet_transactions where user_id=$1`, [uid])).s);
  check(`${name}: sum of ledger = wallet balance`, sum === (await balance(uid)), [sum, await balance(uid)]);
}
const rec = await one(`select
  (select coalesce(sum(charged_cents),0) from public.call_sessions) charged,
  (select -coalesce(sum(amount_cents),0) from public.wallet_transactions where kind='call_charge') debited,
  (select coalesce(sum(amount_cents),0) from public.host_earnings) host,
  (select coalesce(sum(amount_cents),0) from public.platform_commissions) platform,
  (select coalesce(sum(amount_cents),0) from public.call_billing_records) billed`);
check("call charges = wallet debits = billing records", Number(rec.charged) === Number(rec.debited) && Number(rec.charged) === Number(rec.billed), rec);
check("host earnings + HUMI commission = total charged", Number(rec.host) + Number(rec.platform) === Number(rec.charged), rec);
check("ledger rows are immutable", !(await attempt(db.query(`update public.wallet_transactions set amount_cents = 1`))).ok);

console.log("\nPrivacy (RLS)");
check("a customer sees only their own wallet", (await as(bia, `select user_id from public.wallets`)).rows.every((r) => r.user_id === bia));
check("a customer sees only their own ledger", (await as(bia, `select user_id from public.wallet_transactions`)).rows.every((r) => r.user_id === bia));
check("customers can't see host earnings", (await as(ana, `select * from public.host_earnings`)).rows.length === 0);
const sum = (await as(hostUser, `select * from public.my_host_earnings_summary`)).rows[0];
check("host sees own earnings summary (pending during hold)", sum && Number(sum.total_earned_cents) > 0 && Number(sum.pending_cents) === Number(sum.total_earned_cents), sum);
check("host cannot insert earnings", !(await attempt(as(hostUser, `insert into public.host_earnings (host_id, kind, amount_cents, livemode, idempotency_key) values ($1,'adjustment',100000,false,'x')`, [hostId]))).ok);
check("anon sees no wallets", !(await attempt(run("anon", null, `select * from public.wallets`))).ok || (await run("anon", null, `select * from public.wallets`)).rows.length === 0);
check("host sees caller's first name only", (await as(hostUser, `select customer_name from public.my_calls limit 1`)).rows[0]?.customer_name?.length > 0);

if (files.some((f) => f.includes("hide_commission"))) {
  console.log("\nCommission is private");
  check("customers can't read the commission rate", (await as(ana, `select * from public.platform_settings where key='commission_bps'`)).rows.length === 0);
  check("hosts can't read the commission rate either", (await as(hostUser, `select * from public.platform_settings where key='commission_bps'`)).rows.length === 0);
  check("other settings stay public (top-up limits)", (await as(ana, `select * from public.platform_settings where key='topup_min_cents'`)).rows.length === 1);
  check("customers can't read raw call rows (split amounts)", (await as(ana, `select * from public.call_sessions`)).rows.length === 0);
  check("customers can't read billing records", (await as(ana, `select * from public.call_billing_records`)).rows.length === 0);
  const mine = (await as(ana, `select * from public.my_calls where charged_cents > 0 limit 1`)).rows[0];
  check("customer's call view has no commission/platform/host amounts", mine && !("commission_bps" in mine) && !("platform_fee_cents" in mine) && mine.host_earnings_cents === null, mine);
  const hostView = (await as(hostUser, `select * from public.my_calls where charged_cents > 0 limit 1`)).rows[0];
  check("host's call view shows own earnings but no platform amount", hostView && Number(hostView.host_earnings_cents) > 0 && !("platform_fee_cents" in hostView), hostView);
  check("host previews net per minute without seeing the rate (R$ 1,00 → R$ 0,75)", Number((await as(hostUser, `select public.host_net_cents(100) n`)).rows[0].n) === 75);
  check("customers can't use the earnings preview", !(await attempt(as(ana, `select public.host_net_cents(100)`))).ok);
  check("billing still splits correctly after hiding", Number((await one(`select sum(host_earnings_cents) h, sum(platform_fee_cents) p, sum(charged_cents) c from public.call_sessions`)).c) ===
    Number((await one(`select sum(host_earnings_cents) h from public.call_sessions`)).h) + Number((await one(`select sum(platform_fee_cents) p from public.call_sessions`)).p));
}

console.log("\nBookings are free reservations now");
await db.query(`insert into public.host_availability (host_id, day_of_week, start_time, end_time, timezone) select $1, d, '00:00', '24:00', 'UTC' from generate_series(0,6) d`, [hostId]);
const bk = await attempt(as(ana, `insert into public.bookings (customer_id, host_id, scheduled_at, duration_minutes, call_type) values ($1,$2, date_trunc('hour', now()) + interval '2 days', 30, 'audio') returning total_price, currency`, [ana, hostId]));
check("booking saved with no charge", bk.ok && Number(bk.rows[0].total_price) === 0 && bk.rows[0].currency === "BRL", bk);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
