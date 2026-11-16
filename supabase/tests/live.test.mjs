// Real money: test balance and real balance never mix; calls paid with real money are "live".
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
const live = files.at(-1);
for (const f of files.slice(0, -1)) await db.exec(readFileSync(f, "utf8"));

const user = async (email, meta) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).id;
const hostUser = await user("host@x.com", { full_name: "Hana", role: "host" });
const ana = await user("ana@x.com", { full_name: "Ana" });
const bia = await user("bia@x.com", { full_name: "Bia" });
const hostId = (await one(`update public.host_profiles set is_published=true where user_id=$1 returning id`, [hostUser])).id;
await as(hostUser, `select public.set_host_pricing(100, null)`); // R$ 1,00/min

const pay = async (uid, cents, provider) => {
  const t = (await as(uid, `select * from public.create_topup($1,$2,'pix')`, [cents, provider])).rows[0];
  await svc(`select * from public.confirm_topup($1,$2,$3,$4,'approved','pix')`, [t.id, provider, "p_" + t.id.slice(0, 8), cents]);
  return t;
};
const wallet = async (uid) => {
  const w = await one(`select balance_cents b, test_balance_cents t from public.wallets where user_id=$1`, [uid]);
  return { real: Number(w.b), test: Number(w.t) };
};
const start = (uid) => attempt(as(uid, `select * from public.start_call($1,'audio')`, [hostId]));
const tick = async (id, on) => (await svc(`select * from public.call_tick($1,$2)`, [id, on])).rows[0];
const elapse = (id, s) => db.query(`update public.call_sessions set created_at = created_at - make_interval(secs => $2), last_connected_at = last_connected_at - make_interval(secs => $2) where id=$1`, [id, s]);
const talk = async (id, secs) => { let c = await tick(id, true); for (let s = 0; s < secs; s += 30) { await elapse(id, 30); c = await tick(id, true); if (c.status !== "connected") break; } return c; };
const end = (id) => svc(`select public.finish_call($1,'customer_hangup')`, [id]);

console.log("\nBefore: test money only (old single balance)");
await pay(ana, 5000, "test");
check("old balance holds the R$ 50 test top-up", Number((await one(`select balance_cents b from public.wallets where user_id=$1`, [ana])).b) === 5000);

await db.exec(readFileSync(live, "utf8"));
let w = await wallet(ana);
check("migration moves it to TEST balance (real = 0)", w.real === 0 && w.test === 5000, w);
await db.exec(readFileSync(live, "utf8"));
w = await wallet(ana);
check("running the migration again changes nothing", w.real === 0 && w.test === 5000, w);

console.log("\nReal money");
await pay(ana, 2000, "mercadopago");
w = await wallet(ana);
check("real top-up (Mercado Pago live) goes to REAL balance", w.real === 2000 && w.test === 5000, w);
const c1 = (await start(ana)).rows[0];
check("call paid with real money is live", c1.livemode === true);
const c1done = await talk(c1.id, 60);
await end(c1.id);
w = await wallet(ana);
check("charges come from the real balance only", w.real === 2000 - c1done.charged_cents && w.test === 5000, { w, charged: c1done.charged_cents });
const earn1 = await one(`select bool_and(livemode) l, sum(amount_cents)::int s from public.host_earnings where call_id=$1`, [c1.id]);
check("host earnings of a real call are real (payable)", earn1.l === true && earn1.s > 0, earn1);

console.log("\nTest money");
await pay(bia, 3000, "mercadopago_sandbox");
w = await wallet(bia);
check("sandbox top-up goes to TEST balance", w.real === 0 && w.test === 3000, w);
const c2 = (await start(bia)).rows[0];
check("call paid with test balance is a test call", c2.livemode === false);
await talk(c2.id, 60);
await end(c2.id);
const earn2 = await one(`select bool_or(livemode) l from public.host_earnings where call_id=$1`, [c2.id]);
check("its host earnings are test (never payable)", earn2.l === false, earn2);
w = await wallet(bia);
check("charged from the test balance", w.test < 3000 && w.real === 0, w);

const sum = (await as(hostUser, `select * from public.my_host_earnings_summary`)).rows[0];
check("'available' + 'pending' count only real earnings", Number(sum.available_cents) + Number(sum.pending_cents) === earn1.s && Number(sum.test_earned_cents) > 0, sum);

console.log("\nGo live: switch off test calls");
await db.query(`update public.platform_settings set value = 0 where key = 'allow_test_calls'`);
const c3 = await start(bia);
check("with test calls off, test balance can't start a call", !c3.ok && /Add at least/.test(c3.error), c3);
await pay(bia, 1000, "mercadopago");
const c4 = (await start(bia)).rows[0];
check("real money still works", c4?.livemode === true);
// Real money runs out → the call ends even though test balance remains.
const c4done = await talk(c4.id, 1500);
check("a real call ends when REAL money runs out (test balance not touched)", c4done.status === "ended" && c4done.end_reason === "insufficient_funds" && (await wallet(bia)).real === 0 && (await wallet(bia)).test > 0, c4done);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
