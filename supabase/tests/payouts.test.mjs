// Host withdrawals: only real, available call earnings; wallet money is never withdrawable.
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
await db.exec(readFileSync(files.at(-1), "utf8")); // idempotent

const user = async (email, meta) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).id;
const hostUser = await user("host@x.com", { full_name: "Hana", role: "host" });
const ana = await user("ana@x.com", { full_name: "Ana" });
const hostId = (await one(`update public.host_profiles set is_published=true where user_id=$1 returning id`, [hostUser])).id;
await as(hostUser, `select public.set_host_pricing(100, null)`);

const pay = async (uid, cents, provider) => {
  const t = (await as(uid, `select * from public.create_topup($1,$2,'pix')`, [cents, provider])).rows[0];
  await svc(`select * from public.confirm_topup($1,$2,$3,$4,'approved','pix')`, [t.id, provider, "p_" + t.id.slice(0, 8), cents]);
};
const tick = async (id, on) => (await svc(`select * from public.call_tick($1,$2)`, [id, on])).rows[0];
const elapse = (id, s) => db.query(`update public.call_sessions set created_at = created_at - make_interval(secs => $2), last_connected_at = last_connected_at - make_interval(secs => $2) where id=$1`, [id, s]);
const callFor = async (uid, minutes) => {
  const c = (await as(uid, `select * from public.start_call($1,'audio')`, [hostId])).rows[0];
  await tick(c.id, true);
  for (let s = 0; s < minutes * 60; s += 30) { await elapse(c.id, 30); await tick(c.id, true); }
  await svc(`select public.finish_call($1,'customer_hangup')`, [c.id]);
  return c;
};
const available = async () => Number((await one(`select public.host_available_cents($1) a`, [hostId])).a);
const makeAvailable = () => db.exec(`alter table public.host_earnings disable trigger host_earnings_immutable; update public.host_earnings set available_at = now() - interval '1 second' where kind = 'call'; alter table public.host_earnings enable trigger host_earnings_immutable;`);

// Real call: R$ 100 real top-up, 40 min at R$ 1,00/min → host gets 75% = R$ 30,00.
await pay(ana, 10000, "mercadopago");
await callFor(ana, 40);
// Test call: test money never becomes withdrawable.
await pay(ana, 5000, "mercadopago_sandbox");
await db.query(`update public.wallets set balance_cents = 0 where user_id = $1`, [ana]); // force the test pot
await callFor(ana, 10);

console.log("\nBefore the holding period");
check("nothing to withdraw while earnings are on hold", (await available()) === 0);
check("can't withdraw without a Pix key", !(await attempt(as(hostUser, `select public.request_payout(1000)`))).ok);
check("invalid Pix key rejected", !(await attempt(as(hostUser, `select public.set_payout_pix_key('cpf','123')`))).ok);
check("customer can't set a payout key", !(await attempt(as(ana, `select public.set_payout_pix_key('email','ana@x.com')`))).ok);
check("host saves Pix key (CPF)", (await attempt(as(hostUser, `select public.set_payout_pix_key('cpf','123.456.789-09')`))).ok);
check("CPF stored as digits", (await one(`select provider_account_id k from public.payout_accounts where host_id=$1`, [hostId])).k === "12345678909");

await makeAvailable();
console.log("\nAfter the holding period");
const avail = await available();
check("available = real call earnings only (R$ 30,00, test call excluded)", avail === 3000, avail);
check("more than available rejected", !(await attempt(as(hostUser, `select public.request_payout($1)`, [avail + 1]))).ok);
check("below the minimum rejected", !(await attempt(as(hostUser, `select public.request_payout(500)`))).ok);
check("customer can't request a payout", !(await attempt(as(ana, `select public.request_payout(1000)`))).ok);
check("host can't write payout tables directly", !(await attempt(as(hostUser, `insert into public.payout_records (host_id, amount_cents) values ($1, 999999)`, [hostId]))).ok);

const r1 = await attempt(as(hostUser, `select * from public.request_payout(2000)`));
check("host requests R$ 20,00", r1.ok && r1.rows[0].status === "requested", r1);
check("amount reserved at once (R$ 10,00 left)", (await available()) === 1000);
check("second request while one is open rejected", !(await attempt(as(hostUser, `select public.request_payout(1000)`))).ok);

const c1 = await attempt(as(hostUser, `select * from public.cancel_payout($1)`, [r1.rows[0].id]));
check("host cancels → money back (R$ 30,00)", c1.ok && (await available()) === 3000);

const r2 = (await as(hostUser, `select * from public.request_payout(3000)`)).rows[0];
check("host can't mark own payout as paid", !(await attempt(as(hostUser, `select public.admin_update_payout($1,'paid')`, [r2.id]))).ok);
const q = (await db.query(`select * from public.admin_payout_requests where id=$1`, [r2.id])).rows[0];
check("team sees the request with the Pix key", q?.pix_key === "12345678909" && Number(q.amount_cents) === 3000, q);
check("non-admin host sees no team list", (await as(hostUser, `select count(*)::int n from public.admin_payout_requests`)).rows[0].n === 0);
await db.query(`select public.admin_update_payout($1,'paid')`, [r2.id]);
check("team marks it paid; nothing left to withdraw", (await one(`select status from public.payout_records where id=$1`, [r2.id])).status === "paid" && (await available()) === 0);
check("a paid withdrawal can't change again", !(await attempt(db.query(`select public.admin_update_payout($1,'failed')`, [r2.id]))).ok);

const w = await one(`select balance_cents b, test_balance_cents t from public.wallets where user_id=$1`, [ana]);
check("wallet money was never touched by withdrawals", Number(w.t) > 0, w);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
