// First top-up bonus, referral reward, signup source.
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
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz default now(), banned_until timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);
const user = async (email, meta) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).id;
const latest = files.at(-1);
for (const f of files.slice(0, -1)) await db.exec(readFileSync(f, "utf8"));
const oldUser = await user("old@x.com", { full_name: "Olga" }); // existed before the migration
await db.exec(readFileSync(latest, "utf8"));
await db.exec(readFileSync(latest, "utf8")); // safe twice

const code = async (uid) => (await one(`select referral_code c from public.profiles where id=$1`, [uid])).c;
const real = async (uid) => Number((await one(`select coalesce((select balance_cents from public.wallets where user_id=$1),0) b`, [uid])).b);
const pay = async (uid, cents, provider = "mercadopago") => {
  const t = (await as(uid, `select * from public.create_topup($1,$2,'pix')`, [cents, provider])).rows[0];
  await svc(`select * from public.confirm_topup($1,$2,$3,$4,'approved','pix')`, [t.id, provider, "p_" + t.id.slice(0, 8), cents]);
  return t;
};

console.log("\nReferral codes");
check("existing accounts got a code", /^[A-Z2-9]{7}$/.test(await code(oldUser)));
const inviter = await user("inviter@x.com", { full_name: "Ivo" });
check("new accounts get a code automatically", /^[A-Z2-9]{7}$/.test(await code(inviter)));
check("codes are unique", (await code(inviter)) !== (await code(oldUser)));
check("nobody can write their own code/referrer directly", !(await attempt(as(inviter, `update public.profiles set referral_code='HACKED1' where id=$1`, [inviter]))).ok);

console.log("\nSign-up source + who invited");
const ana = await user("ana@x.com", { full_name: "Ana" });
await as(ana, `select public.set_signup_source($1::jsonb, $2)`, [JSON.stringify({ utm_source: "instagram", utm_campaign: "ingles" }), (await code(inviter)).toLowerCase()]);
const p = await one(`select signup_source s, referred_by r from public.profiles where id=$1`, [ana]);
check("source saved (utm_source instagram)", p.s?.utm_source === "instagram", p);
check("invited by the code owner (code is case-insensitive)", p.r === inviter, p);
await as(ana, `select public.set_signup_source($1::jsonb, $2)`, [JSON.stringify({ utm_source: "tiktok" }), await code(oldUser)]);
const p2 = await one(`select signup_source s, referred_by r from public.profiles where id=$1`, [ana]);
check("source and inviter can't be changed later", p2.s.utm_source === "instagram" && p2.r === inviter, p2);
const self = await user("self@x.com", { full_name: "Sam" });
await as(self, `select public.set_signup_source(null, $1)`, [await code(self)]);
check("you can't invite yourself", (await one(`select referred_by r from public.profiles where id=$1`, [self])).r === null);
await db.query(`update public.profiles set created_at = now() - interval '10 days' where id=$1`, [oldUser]);
await as(oldUser, `select public.set_signup_source(null, $1)`, [await code(inviter)]);
check("old accounts can't attach an inviter afterwards", (await one(`select referred_by r from public.profiles where id=$1`, [oldUser])).r === null);

console.log("\nFirst top-up bonus + referral reward");
const small = await user("small@x.com", { full_name: "Bia" });
await pay(small, 1000); // R$ 10 < R$ 20 minimum
check("first top-up below R$ 20: no bonus", (await real(small)) === 1000);
await pay(small, 5000);
check("bonus only on the FIRST top-up (second one doesn't count)", (await real(small)) === 6000);

const t1 = await pay(ana, 2000);
check("first top-up R$ 20 → +R$ 5 welcome bonus (R$ 25)", (await real(ana)) === 2500, await real(ana));
check("inviter gets R$ 5 credit", (await real(inviter)) === 500);
await pay(ana, 3000);
check("second top-up: no more bonus for anyone", (await real(ana)) === 5500 && (await real(inviter)) === 500);
const mine = (await as(inviter, `select * from public.my_referral()`)).rows[0];
check("inviter sees 1 invited, R$ 5 earned", mine.invited === 1 && Number(mine.rewarded_cents) === 500, mine);

const sandbox = await user("test@x.com", { full_name: "Teo" });
await pay(sandbox, 2000, "mercadopago_sandbox");
const w = await one(`select balance_cents b, test_balance_cents t from public.wallets where user_id=$1`, [sandbox]);
check("sandbox top-up bonus goes to TEST balance (never real money)", Number(w.b) === 0 && Number(w.t) === 2500, w);

console.log("\nRefund takes bonuses back");
const rafa = await user("rafa@x.com", { full_name: "Rafa" });
await as(rafa, `select public.set_signup_source(null, $1)`, [await code(inviter)]);
const tr = await pay(rafa, 2000);
check("Rafa got R$ 25, inviter now R$ 10", (await real(rafa)) === 2500 && (await real(inviter)) === 1000);
await svc(`select * from public.confirm_topup($1,'mercadopago',$2,2000,'refunded')`, [tr.id, "p_" + tr.id.slice(0, 8)]);
check("refund removes top-up and bonus (Rafa back to R$ 0)", (await real(rafa)) === 0, await real(rafa));
check("inviter's reward for Rafa is taken back (R$ 5)", (await real(inviter)) === 500, await real(inviter));

console.log("\nSettings & admin");
check("anyone can read the promo numbers", Number((await run("anon", null, `select * from public.promo_settings()`)).rows[0].first_topup_bonus_cents) === 500);
await db.query(`insert into public.platform_admins (user_id) values ($1)`, [inviter]);
check("admin can change the bonus", (await attempt(as(inviter, `select public.admin_set_setting('first_topup_bonus_cents', 1000)`))).ok);
check("absurd bonus rejected", !(await attempt(as(inviter, `select public.admin_set_setting('referral_bonus_cents', 999999)`))).ok);
const src = (await as(inviter, `select * from public.admin_signup_sources(30)`)).rows;
check("admin sees sign-ups per source", src.some((r) => r.source === "instagram" && Number(r.signups) === 1 && Number(r.paying) === 1) && src.some((r) => r.source === "referral"), src);
check("non-admin can't see sources", !(await attempt(as(ana, `select * from public.admin_signup_sources(30)`))).ok);
check("bonus can't be called directly", !(await attempt(as(ana, `select public.apply_topup_promos(t) from public.wallet_topups t limit 1`))).ok);
check("first-top-up flag", (await as(ana, `select public.my_first_topup_done() d`)).rows[0].d === true && (await as(self, `select public.my_first_topup_done() d`)).rows[0].d === false);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
