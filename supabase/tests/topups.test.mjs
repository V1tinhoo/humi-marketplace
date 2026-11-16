// Mercado Pago top-ups: sandbox = test balance, live = real money, credit once.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const db = new PGlite({ extensions: { btree_gist } });
let fail = 0;
const check = (n, c, i) => { console.log(c ? "  PASS" : "  FAIL", n, c ? "" : JSON.stringify(i ?? "")); if (!c) fail++; };
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const as = (uid, sql, params = []) =>
  db.transaction(async (t) => {
    await t.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`);
    return t.query(sql, params);
  });
const fails = async (fn) => { try { await fn(); return false; } catch { return true; } };

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);
for (const f of files) await db.exec(readFileSync(f, "utf8"));
await db.exec(readFileSync(files.at(-1), "utf8")); // idempotent

const user = async (email, meta) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).id;
const ana = await user("a@x.com", { full_name: "Ana" });
const topup = async (provider) => (await as(ana, `select * from public.create_topup(5000, $1, 'pix')`, [provider])).rows[0];
check("sandbox Mercado Pago top-up is test balance", (await topup("mercadopago_sandbox")).livemode === false);
check("live Mercado Pago top-up is real money", (await topup("mercadopago")).livemode === true);
check("test provider stays test balance", (await topup("test")).livemode === false);
check("unknown provider rejected", await fails(() => topup("fake")));
const t = await topup("mercadopago_sandbox");
check("only the webhook (service role) can confirm", await fails(() => as(ana, `select public.confirm_topup($1,'mercadopago_sandbox','1',5000,'approved')`, [t.id])));
const svc = (sql, p=[]) => db.transaction(async (x) => { await x.exec("set local role service_role;"); return x.query(sql, p); });
check("wrong amount rejected", await fails(() => svc(`select public.confirm_topup($1,'mercadopago_sandbox','mp1',4999,'approved','pix')`, [t.id])));
await svc(`select public.confirm_topup($1,'mercadopago_sandbox','mp1',5000,'approved','pix')`, [t.id]);
await svc(`select public.confirm_topup($1,'mercadopago_sandbox','mp1',5000,'approved','pix')`, [t.id]);
const bal = await one(`select balance_cents from public.wallets where user_id=$1`, [ana]);
check("approved twice credits once (R$ 50)", Number(bal.balance_cents) === 5000, bal);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
