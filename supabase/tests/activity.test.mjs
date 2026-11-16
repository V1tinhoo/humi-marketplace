// Wallet activity: a long call is ONE line with its full total, and older items aren't pushed out.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const db = new PGlite({ extensions: { btree_gist } });
let fail = 0;
const check = (n, c, i) => { console.log(c ? "  PASS" : "  FAIL", n, c ? "" : JSON.stringify(i ?? "")); if (!c) fail++; };
const as = (uid, sql, params = []) => db.transaction(async (t) => {
  await t.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`);
  return t.query(sql, params);
});
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

const user = async (email) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,'{"full_name":"X"}') returning id`, [email])).id;
const ana = await user("ana@x.com");
const bob = await user("bob@x.com");
const callA = "11111111-1111-4111-8111-111111111111";
const callB = "22222222-2222-4222-8222-222222222222";

// R$ 20 top-up, a short call (45 cents), then a long call billed in 300 small charges until the balance is 0.
let bal = 2000, n = 0;
const tx = async (uid, kind, amount, ref, desc, minutesAgo) => {
  bal += amount;
  await db.query(
    `insert into public.wallet_transactions (user_id, kind, amount_cents, balance_after_cents, reference_id, idempotency_key, livemode, description, created_at)
     values ($1,$2,$3,$4,$5,$6,true,$7, now() - make_interval(secs => $8))`,
    [uid, kind, amount, bal, ref, "k" + n++, desc, minutesAgo * 60],
  );
};
bal = 0;
await tx(ana, "topup", 2000, null, "Top-up", 120);
await tx(ana, "call_charge", -45, callA, "Call charge", 100);
for (let i = 0; i < 300; i++) await tx(ana, "call_charge", i < 255 ? -6 : -7, callB, "Call charge", 60 - i * 0.1);
// 255*6 + 45*7 = 1530 + 315 = 1845; 2000 - 45 - 1845 = 110 → add a final charge to reach 0
await tx(ana, "call_charge", -110, callB, "Call charge", 29);
await tx(bob, "topup", 5000, null, "Top-up", 10);

const rows = (await as(ana, `select * from public.my_wallet_activity order by created_at desc`)).rows;
check("3 lines: long call, short call, top-up", rows.length === 3, rows.map((r) => [r.kind, r.amount_cents]));
const long = rows.find((r) => r.reference_id === callB);
check("long call shows its full total (R$ 19,55)", Number(long?.amount_cents) === -1955, long);
check("…and the balance after it (R$ 0,00)", Number(long?.balance_after_cents) === 0, long);
check("short call still listed (R$ 0,45)", Number(rows.find((r) => r.reference_id === callA)?.amount_cents) === -45);
check("top-up still listed", rows.some((r) => r.kind === "topup" && Number(r.amount_cents) === 2000));
check("only your own lines", !rows.some((r) => r.user_id !== ana));
check("anon can't read it", await db.transaction(async (t) => { await t.exec("set local role anon"); return t.query("select 1 from public.my_wallet_activity"); }).then(() => false, () => true));

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
