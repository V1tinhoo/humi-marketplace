// Admin permission and admin functions: only admins (or the SQL editor) can use them.
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
await db.exec(readFileSync(files.at(-1), "utf8")); // idempotent

const user = async (email, meta) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).id;
const boss = await user("boss@x.com", { full_name: "Victor Boss", role: "host" });
const other = await user("other@x.com", { full_name: "Ana" });
const hostUser = await user("host@x.com", { full_name: "Hana", role: "host" });
const hostId = (await one(`update public.host_profiles set is_published = true where user_id=$1 returning id`, [hostUser])).id;
const bossHost = (await one(`update public.host_profiles set is_published = true where user_id=$1 returning id`, [boss])).id;

console.log("\nMaking an admin");
check("nobody is admin at first", (await as(boss, `select public.am_i_admin() a`)).rows[0].a === false);
check("a user can't make themselves admin", !(await attempt(as(boss, `insert into public.platform_admins (user_id) values ($1)`, [boss]))).ok);
check("a non-admin can't call admin functions", !(await attempt(as(other, `select public.admin_overview()`))).ok);
await db.query(`insert into public.platform_admins (user_id) select id from auth.users where email = 'boss@x.com' on conflict do nothing`); // SQL editor
check("SQL editor makes boss@x.com admin", (await as(boss, `select public.am_i_admin() a`)).rows[0].a === true);
check("admin keeps their host account (still listed in Explore)",
  (await one(`select role from public.profiles where id=$1`, [boss])).role === "host" &&
  !!(await one(`select id from public.public_hosts where id=$1`, [bossHost])));

console.log("\nAdmin powers");
const ov = (await as(boss, `select public.admin_overview() o`)).rows[0].o;
check("overview numbers", ov.users === 3 && ov.hosts_published === 2, ov);
const list = (await as(boss, `select * from public.admin_list_users('hana')`)).rows;
check("search users by name/email", list.length === 1 && list[0].email === "host@x.com", list);
check("hide a host from Explore", (await attempt(as(boss, `select public.admin_set_host_published($1,false)`, [hostId]))).ok
  && !(await one(`select id from public.public_hosts where id=$1`, [hostId])));
await as(boss, `select public.admin_set_host_published($1,true)`, [hostId]);
check("show it again", !!(await one(`select id from public.public_hosts where id=$1`, [hostId])));

check("wallet credit needs a reason", !(await attempt(as(boss, `select public.admin_adjust_wallet($1, 500, '')`, [other]))).ok);
await as(boss, `select public.admin_adjust_wallet($1, 500, 'Refund for a dropped call')`, [other]);
check("wallet credit R$ 5,00 (real money)", Number((await one(`select balance_cents b from public.wallets where user_id=$1`, [other])).b) === 500);
check("wallet can't go negative", !(await attempt(as(boss, `select public.admin_adjust_wallet($1, -600, 'oops')`, [other]))).ok);

await as(boss, `select public.admin_adjust_earnings($1, 33, 'Manual credit')`, [hostId]);
check("host earnings +R$ 0,33, available now", Number((await one(`select public.host_available_cents($1) a`, [hostId])).a) === 33);
check("earnings can't go negative", !(await attempt(as(boss, `select public.admin_adjust_earnings($1, -100, 'x')`, [hostId]))).ok);

check("setting change within limits", (await attempt(as(boss, `select public.admin_set_setting('earnings_hold_days', 3)`))).ok
  && Number((await one(`select value v from public.platform_settings where key='earnings_hold_days'`)).v) === 3);
check("absurd setting value rejected (commission 95%)", !(await attempt(as(boss, `select public.admin_set_setting('commission_bps', 9500)`))).ok);
check("unknown setting rejected", !(await attempt(as(boss, `select public.admin_set_setting('hack', 1)`))).ok);
check("min price above max rejected", !(await attempt(as(boss, `select public.admin_set_setting('price_min_cents_per_minute', 900)`))).ok);

// Reports
const rep = (await as(other, `select public.report_user('harassment', 'rude', null, null, $1) r`, [hostId])).rows[0].r;
const reps = (await as(boss, `select * from public.admin_list_reports()`)).rows;
check("admin sees reports with names", reps.length === 1 && reps[0].reported_name === "Hana", reps);
await as(boss, `select public.admin_update_report($1, 'action_taken', 'Warned the host')`, [rep]);
check("admin updates report status + note", (await one(`select status, admin_note from public.user_reports where id=$1`, [rep])).admin_note === "Warned the host");

console.log("\nGranting / revoking admin");
await as(boss, `select public.admin_set_admin($1, true)`, [other]);
check("admin makes another user admin", (await as(other, `select public.am_i_admin() a`)).rows[0].a === true);
check("admin can't remove their own access", !(await attempt(as(boss, `select public.admin_set_admin($1, false)`, [boss]))).ok);
await as(boss, `select public.admin_set_admin($1, false)`, [other]);
check("admin removes another admin", (await as(other, `select public.am_i_admin() a`)).rows[0].a === false);
check("removed admin loses access", !(await attempt(as(other, `select * from public.admin_list_users()`))).ok);

const log = (await as(boss, `select * from public.admin_list_actions()`)).rows.map((r) => r.action);
check("every action is logged", ["hide_host", "show_host", "wallet_adjustment", "earnings_adjustment", "setting", "report_action_taken", "grant_admin", "revoke_admin"].every((a) => log.includes(a)), log);
check("non-admins can't read the admin log", !(await attempt(as(hostUser, `select * from public.admin_list_actions()`))).ok);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
