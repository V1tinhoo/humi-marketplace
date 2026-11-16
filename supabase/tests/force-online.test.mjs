// Admin can force a host to show as online for a period (ends by itself or with "Set offline").
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
const boss = await user("boss@x.com", { full_name: "Boss" });
await db.query(`insert into public.platform_admins (user_id) values ($1)`, [boss]);
const joe = await user("joe@x.com", { full_name: "Joe" });
const hostU = await user("host@x.com", { full_name: "Hana", role: "host" });
const h = (await one(`select id from public.host_profiles where user_id=$1`, [hostU])).id;
// A complete profile (required to publish).
await db.query(`update public.profiles set avatar_url='https://exemplo.com/f.jpg' where id=$1`, [hostU]);
await db.query(`insert into public.host_availability (host_id, day_of_week, start_time, end_time, timezone) values ($1, 1, '18:00', '22:00', 'UTC')`, [h]);
await db.query(`update public.host_profiles set tagline='Oi', description='Adoro conversar', categories=array['talk'] where id=$1`, [h]);
await db.query(`update public.host_profiles set is_published=true, is_available=false, last_seen_at=null where id=$1`, [h]);
const pub = async () => (await db.query(`select is_online from public.public_hosts where id=$1`, [h])).rows[0]?.is_online;
const pres = async () => (await as(boss, `select * from public.admin_hosts_presence() where host_id=$1`, [h])).rows[0];

check("host not on the site is offline", (await pub()) === false);
const until = (await as(boss, `select public.admin_force_host_online($1, 4) u`, [h])).rows[0].u;
check("admin forces online for 4 h → shows online to customers", (await pub()) === true && !!until);
const p = await pres();
check("admin list shows it as forced, with the end time", !!p.forced_online_until && p.is_online === true, p);
check("counts as online in the admin overview", Number((await as(boss, `select public.admin_overview() o`)).rows[0].o.hosts_online) >= 1);
check("the host can't change the forced time", !(await attempt(as(hostU, `update public.host_profiles set forced_online_until = now() + interval '100 days' where id=$1`, [h]))).ok);
check("non-admins can't force anyone", !(await attempt(as(joe, `select public.admin_force_host_online($1, 4)`, [h]))).ok);
check("more than 72 h is refused", !(await attempt(as(boss, `select public.admin_force_host_online($1, 100)`, [h]))).ok);
await db.query(`update public.host_profiles set forced_online_until = now() - interval '1 minute' where id=$1`, [h]);
check("ends by itself when the time is up", (await pub()) === false);
await as(boss, `select public.admin_force_host_online($1, 1)`, [h]);
await as(boss, `select public.admin_set_host_available($1, false)`, [h]);
check("'Set offline' also ends the forced period", (await pub()) === false && !(await pres()).forced_online_until);
await as(boss, `select public.admin_force_host_online($1, 1)`, [h]);
await as(boss, `select public.admin_force_host_online($1, 0)`, [h]);
check("0 hours cancels", (await pub()) === false);
check("every change is logged", (await one(`select count(*)::int n from public.admin_actions where action in ('force_online','force_online_cancel') and target=$1`, [h])).n === 4);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
