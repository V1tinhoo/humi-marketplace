// Admin can switch a host's "Online now" on/off; real presence still decides who shows as online.
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
const pres = async () => (await as(boss, `select * from public.admin_hosts_presence() where host_id=$1`, [h])).rows[0];

await db.query(`update public.host_profiles set is_available=true, last_seen_at=now() where id=$1`, [h]);
check("host with the site open shows online", (await pres()).is_online === true);
await as(boss, `select public.admin_set_host_available($1, false)`, [h]);
let p = await pres();
check("admin switches it off → offline right away", p.is_available === false && p.is_online === false, p);
check("…and it's logged", (await one(`select count(*)::int n from public.admin_actions where action='host_available_off' and target=$1`, [h])).n === 1);
await as(boss, `select public.admin_set_host_available($1, true)`, [h]);
check("admin switches it on → online again (host has the site open)", (await pres()).is_online === true);
await db.query(`update public.host_profiles set last_seen_at=now() - interval '10 minutes' where id=$1`, [h]);
p = await pres();
check("switch on but host not on the site → not shown as online", p.is_available === true && p.is_online === false, p);
check("non-admins can't switch hosts", !(await attempt(as(joe, `select public.admin_set_host_available($1, true)`, [h]))).ok);
check("non-admins can't read presence", !(await attempt(as(joe, `select * from public.admin_hosts_presence()`))).ok);
check("unknown host → error", !(await attempt(as(boss, `select public.admin_set_host_available(gen_random_uuid(), true)`))).ok);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
