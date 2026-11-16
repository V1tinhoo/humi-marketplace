// Checks host presence: online only when the switch is on AND a recent heartbeat exists.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const db = new PGlite({ extensions: { btree_gist } });
let fail = 0;
const check = (n, c, i) => { console.log(c ? "  PASS" : "  FAIL", n, c ? "" : JSON.stringify(i ?? "")); if (!c) fail++; };
const as = (uid, fn) => db.transaction(async (t) => {
  if (uid === "anon") await t.exec(`set local role anon;`);
  else await t.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`);
  return fn(t);
});
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);
for (const f of files) await db.exec(readFileSync(f, "utf8"));
await db.exec(readFileSync(files.at(-1), "utf8")); // idempotent

const host = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('h@x.com','{"full_name":"Hana","role":"host"}') returning id`)).rows[0].id;
const other = (await db.query(`insert into auth.users (email) values ('o@x.com') returning id`)).rows[0].id;
await as(host, (t) => t.query(`update public.host_profiles set is_published=true, is_available=true where user_id=$1`, [host]));
const online = async () => (await as("anon", (t) => t.query(`select is_online from public.public_hosts`))).rows[0]?.is_online;

check("switch ON but never seen → offline", (await online()) === false);
await as(host, (t) => t.query(`select public.host_presence(true)`));
check("switch ON + fresh heartbeat → online", (await online()) === true);
await db.query(`update public.host_profiles set last_seen_at = now() - interval '4 minutes' where user_id=$1`, [host]);
check("heartbeat older than 3 min → offline", (await online()) === false);
await as(host, (t) => t.query(`select public.host_presence(true)`));
await as(host, (t) => t.query(`update public.host_profiles set is_available=false where user_id=$1`, [host]));
check("switch OFF with fresh heartbeat → offline", (await online()) === false);
await as(host, (t) => t.query(`update public.host_profiles set is_available=true where user_id=$1`, [host]));
await as(host, (t) => t.query(`select public.host_presence(false)`));
check("explicit sign-out (presence false) → offline immediately", (await online()) === false);

let direct = false;
try { await as(host, (t) => t.query(`update public.host_profiles set last_seen_at = now() + interval '1 year' where user_id=$1`, [host])); } catch { direct = true; }
check("host cannot fake last_seen_at directly", direct);
await as(other, (t) => t.query(`select public.host_presence(true)`));
check("another user's heartbeat doesn't make the host online", (await online()) === false);
let anonDenied = false;
try { await as("anon", (t) => t.query(`select public.host_presence(true)`)); } catch { anonDenied = true; }
check("anon cannot send heartbeats", anonDenied);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
