// Minute packages: buying, using them in calls (then the wallet), host earnings, cancel, expiry, monthly renewal.
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
const anon = (sql, params) => run("anon", null, sql, params);
const svc = (sql, params) => run("service_role", null, sql, params);
const attempt = (p) => p.then((r) => ({ ok: true, rows: r.rows }), (e) => ({ ok: false, error: e.message }));
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz default now(), banned_until timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);
for (const f of files) await db.exec(readFileSync(f, "utf8"));
await db.exec(readFileSync(files.at(-1), "utf8")); // safe twice

const user = async (email, meta) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).id;
const newHost = async (email, name, audio = 100, video = 150) => {
  const u = await user(email, { full_name: name, role: "host" });
  const id = (await one(`select id from public.host_profiles where user_id=$1`, [u])).id;
  await db.query(`update public.profiles set avatar_url='https://x.com/a.jpg' where id=$1`, [u]);
  await db.query(`insert into public.host_availability (host_id, day_of_week, start_time, end_time, timezone) values ($1,1,'18:00','22:00','UTC')`, [id]);
  await db.query(`update public.host_profiles set tagline='Oi', description='Olá', categories=array['talk'] where id=$1`, [id]);
  await db.query(`update public.host_profiles set is_published=true where id=$1`, [id]);
  await as(u, `select public.set_host_pricing($1,$2)`, [audio, video]);
  return { u, id };
};
const pay = async (uid, cents) => {
  const t = (await as(uid, `select * from public.create_topup($1,'mercadopago','pix')`, [cents])).rows[0];
  await svc(`select * from public.confirm_topup($1,'mercadopago',$2,$3,'approved','pix')`, [t.id, "p_" + t.id.slice(0, 8), cents]);
};
const wallet = async (uid) => Number((await one(`select balance_cents b from public.wallets where user_id=$1`, [uid])).b);
const start = (uid, hostId, type = "audio") => attempt(as(uid, `select * from public.start_call($1,$2)`, [hostId, type]));
const tick = async (id, on) => (await svc(`select * from public.call_tick($1,$2)`, [id, on])).rows[0];
const elapse = (id, s) => db.query(`update public.call_sessions set created_at = created_at - make_interval(secs => $2), last_connected_at = last_connected_at - make_interval(secs => $2) where id=$1`, [id, s]);
const talk = async (id, secs) => { let c = await tick(id, true); for (let s = 0; s < secs; s += 30) { await elapse(id, 30); c = await tick(id, true); if (c.status !== "connected") break; } return c; };
const end = (id) => svc(`select public.finish_call($1,'customer_hangup')`, [id]);
const buy = (uid, hostId, type, tier, renew = false) => attempt(as(uid, `select * from public.buy_package($1,$2,$3,$4)`, [hostId, type, tier, renew]));
const pkg = async (id) => one(`select * from public.minute_packages where id=$1`, [id]);

const hana = await newHost("hana@x.com", "Hana", 100, 150); // R$ 1,00 audio / R$ 1,50 video
const ana = await user("ana@x.com", { full_name: "Ana" });
const bia = await user("bia@x.com", { full_name: "Bia" });

console.log("\nOffers");
const offers = (await anon(`select * from public.package_offers($1)`, [hana.id])).rows;
const a = (t) => offers.find((o) => o.call_type === "audio" && o.tier === t);
check("3 audio + 3 video offers, visible to visitors", offers.length === 6);
check("60 min −5% = R$ 57,00 · 120 min −10% = R$ 108,00 · 300 min −15% = R$ 255,00", Number(a(1).total_cents) === 5700 && Number(a(2).total_cents) === 10800 && Number(a(3).total_cents) === 25500, offers);
check("video uses the video price (60 min = R$ 85,50)", Number(offers.find((o) => o.call_type === "video" && o.tier === 1).total_cents) === 8550);

console.log("\nBuying");
let r = await buy(ana, hana.id, "audio", 1);
check("can't buy without balance", !r.ok && /buy this package/.test(r.error), r);
await pay(ana, 10000);
const wAna0 = await wallet(ana); // R$ 100 + first top-up bonus
r = await buy(ana, hana.id, "audio", 1);
const p1 = r.rows[0];
check("buys 60 min for R$ 57,00 from the wallet", r.ok && (await wallet(ana)) === wAna0 - 5700 && p1.status === "active" && p1.seconds_total === 3600, r);
check("valid for 90 days", Math.round((new Date(p1.expires_at) - new Date(p1.created_at)) / 86400000) === 90);
check("wallet shows 'Minute package'", (await one(`select description d from public.wallet_transactions where reference_id=$1`, [p1.id])).d === "Minute package");
check("visitors can't buy", !(await attempt(anon(`select public.buy_package($1,'audio',1,false)`, [hana.id]))).ok);
check("a host can't buy a package with themselves", !(await buy(hana.u, hana.id, "audio", 1)).ok);
check("other customers can't see Ana's package", (await as(bia, `select * from public.minute_packages`)).rows.length === 0);
check("the host sees packages bought with them", (await as(hana.u, `select * from public.minute_packages`)).rows.length === 1);
check("nobody writes packages directly", !(await attempt(as(ana, `update public.minute_packages set seconds_used=0`))).ok);

console.log("\nCalls use the package first");
let c = (await start(ana, hana.id)).rows[0];
check("the call is linked to the package and is live (real money)", c.package_id === p1.id && c.livemode === true, c);
c = await talk(c.id, 600); await end(c.id);
c = await one(`select * from public.call_sessions where id=$1`, [c.id]);
let pk = await pkg(p1.id);
check("10 min: package used 600 s, value R$ 9,50 (57 × 600/3600)", pk.seconds_used === 600 && Number(pk.used_cents) === 950, pk);
check("wallet untouched", (await wallet(ana)) === wAna0 - 5700);
check("call total = package value; host 80% (R$ 7,60), HUMI 20% (R$ 1,90)", Number(c.charged_cents) === 950 && Number(c.host_earnings_cents) === 760 && Number(c.platform_fee_cents) === 190, c);
const earn = await one(`select sum(amount_cents)::int s, bool_and(livemode) l from public.host_earnings where call_id=$1`, [c.id]);
check("host earnings recorded as minutes are used (real, with holding period)", earn.s === 760 && earn.l === true, earn);
check("a video call doesn't use the audio package", (await start(ana, hana.id, "video")).rows[0]?.package_id == null);
await svc(`update public.call_sessions set status='ended', end_reason='customer_hangup', ended_at=now() where customer_id=$1 and status in ('ringing','connected')`, [ana]);

console.log("\nPackage runs out mid-call → continues on the wallet");
c = (await start(ana, hana.id)).rows[0];
c = await talk(c.id, 3000 + 120); // 50 min left in the package + 2 min on the wallet
await end(c.id);
c = await one(`select * from public.call_sessions where id=$1`, [c.id]);
pk = await pkg(p1.id);
check("package fully used (status 'used', value R$ 57,00)", pk.status === "used" && pk.seconds_used === 3600 && Number(pk.used_cents) === 5700, pk);
check("extra minutes charged at the normal price (2 min = R$ 2,00 from the wallet)", (await wallet(ana)) === wAna0 - 5700 - 200 && Number(c.charged_cents) === (5700 - 950) + 200, { w: await wallet(ana), c: c.charged_cents });
check("host share on the whole call is 80%", Number(c.host_earnings_cents) === Math.floor(Number(c.charged_cents) * 0.8));
c = (await start(ana, hana.id)).rows[0];
check("next call has no package (pays from the wallet)", c.package_id === null);
await svc(`update public.call_sessions set status='ended', end_reason='customer_hangup', ended_at=now() where id=$1`, [c.id]);

console.log("\nCalls without packages are billed exactly as before");
await pay(bia, 5000);
const wBia0 = await wallet(bia);
c = (await start(bia, hana.id)).rows[0];
c = await talk(c.id, 180); await end(c.id);
c = await one(`select * from public.call_sessions where id=$1`, [c.id]);
check("3 min at R$ 1,00 = R$ 3,00 from the wallet, host R$ 2,40, HUMI R$ 0,60", Number(c.charged_cents) === 300 && (await wallet(bia)) === wBia0 - 300 && Number(c.host_earnings_cents) === 240 && Number(c.platform_fee_cents) === 60, c);
await db.query(`update public.wallets set balance_cents = 150 where user_id=$1`, [bia]); // R$ 1,50 left (1.5 min)
c = (await start(bia, hana.id)).rows[0];
c = await talk(c.id, 300);
check("out of balance still ends the call (charged exactly what was left)", c.status === "ended" && c.end_reason === "insufficient_funds" && (await wallet(bia)) === 0, c);

console.log("\nCancel → unused value back to the wallet");
await pay(bia, 10000);
const b2 = await buy(bia, hana.id, "audio", 1);
if (!b2.ok) console.log("buy p2 failed:", b2.error);
const p2 = b2.rows[0];
c = (await start(bia, hana.id)).rows[0];
check("can't cancel during a call that uses it", !(await attempt(as(bia, `select public.cancel_package($1)`, [p2.id]))).ok);
c = await talk(c.id, 300); await end(c.id);
const before = await wallet(bia);
const cancelled = (await as(bia, `select * from public.cancel_package($1)`, [p2.id])).rows[0];
check("used 5 min (R$ 4,75); cancelling returns R$ 52,25 to the wallet", cancelled.status === "cancelled" && Number(cancelled.refunded_cents) === 5225 && (await wallet(bia)) === before + 5225, cancelled);
check("others can't cancel someone's package", !(await attempt(as(ana, `select public.cancel_package($1)`, [p2.id]))).ok);

console.log("\nExpiry after 90 days");
await pay(ana, 10000);
const p3 = (await buy(ana, hana.id, "audio", 1)).rows[0];
await db.query(`update public.minute_packages set expires_at = now() - interval '1 minute' where id=$1`, [p3.id]);
const w0 = await wallet(ana);
const mine = (await as(ana, `select * from public.my_packages()`)).rows;
pk = await pkg(p3.id);
check("opening 'my packages' expires it and returns the full R$ 57,00", pk.status === "expired" && Number(pk.refunded_cents) === 5700 && (await wallet(ana)) === w0 + 5700, pk);
check("my_packages lists the host name", mine.some((m) => m.host_name === "Hana"));
check("an expired package isn't used by calls", (await start(ana, hana.id)).rows[0]?.package_id === null);
await svc(`update public.call_sessions set status='ended', end_reason='customer_hangup', ended_at=now() where customer_id=$1 and status in ('ringing','connected')`, [ana]);

console.log("\nMonthly renewal");
await pay(ana, 20000);
const p4 = (await buy(ana, hana.id, "audio", 1, true)).rows[0];
let sub = await one(`select * from public.package_subscriptions where id=$1`, [p4.subscription_id]);
check("subscription created, next renewal in 30 days", sub.active && Math.round((new Date(sub.next_renewal_at) - new Date(sub.created_at)) / 86400000) === 30, sub);
check("only one renewal per host and type", !(await buy(ana, hana.id, "audio", 2, true)).ok);
await db.query(`update public.package_subscriptions set next_renewal_at = now() - interval '1 minute' where id=$1`, [sub.id]);
const w1 = await wallet(ana);
await svc(`select public.process_packages()`); // the daily job
sub = await one(`select * from public.package_subscriptions where id=$1`, [sub.id]);
check("renewed: a new package bought from the wallet (−R$ 57,00), next renewal pushed 30 days", sub.last_package_id !== p4.id && (await wallet(ana)) === w1 - 5700 && new Date(sub.next_renewal_at) > new Date(), sub);
await db.query(`update public.wallets set balance_cents = 1000 where user_id=$1`, [ana]);
await db.query(`update public.package_subscriptions set next_renewal_at = now() - interval '1 minute' where id=$1`, [sub.id]);
await svc(`select public.process_packages()`);
sub = await one(`select * from public.package_subscriptions where id=$1`, [sub.id]);
check("not enough balance → renewal stops, reason shown, nothing charged", sub.active === false && sub.stopped_reason === "insufficient_balance" && (await wallet(ana)) === 1000, sub);
await as(ana, `select public.set_package_renewal($1, true)`, [sub.id]);
check("customer can switch it back on", (await one(`select active from public.package_subscriptions where id=$1`, [sub.id])).active === true);
await as(ana, `select public.set_package_renewal($1, false)`, [sub.id]);
check("…and cancel it any time", (await one(`select active, stopped_reason r from public.package_subscriptions where id=$1`, [sub.id])).r === "cancelled");
check("customers can't run the daily job for everyone", !(await attempt(as(ana, `select public.process_packages()`))).ok);

console.log("\nMeter and settings");
const p5 = (await buy(bia, hana.id, "audio", 1)).rows[0];
c = (await start(bia, hana.id)).rows[0];
check("call screen sees the package seconds left (3600)", (await as(bia, `select public.call_package_left($1) s`, [c.id])).rows[0].s === 3600);
check("…but not someone else's", (await as(ana, `select public.call_package_left($1) s`, [c.id])).rows[0].s === 0);
await svc(`update public.call_sessions set status='ended', end_reason='customer_hangup', ended_at=now() where id=$1`, [c.id]);
const boss = await user("boss@x.com", { full_name: "Boss" });
await db.query(`insert into public.platform_admins (user_id) values ($1)`, [boss]);
check("admin can change a tier's discount", (await attempt(as(boss, `select public.admin_set_setting('package_1_discount_bps', 800)`))).ok && Number((await anon(`select total_cents from public.package_offers($1) where tier=1 and call_type='audio'`, [hana.id])).rows[0].total_cents) === 5520);
check("…within limits", !(await attempt(as(boss, `select public.admin_set_setting('package_1_discount_bps', 9000)`))).ok);
void p5;

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
