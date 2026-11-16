// Checks the profile backfill migration: users created before the schema existed get fixed.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";

const [initial, backfill] = process.argv.slice(2);
const db = new PGlite({ extensions: { btree_gist } });
let fail = 0;
const check = (name, cond, info) => { console.log(cond ? "  PASS" : "  FAIL", name, cond ? "" : JSON.stringify(info ?? "")); if (!cond) fail++; };
const as = (uid, fn) => db.transaction(async (t) => {
  await t.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`);
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

// Users who signed up BEFORE the schema existed (no trigger yet).
const early = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('victor@test.local', '{"full_name":"Victor"}') returning id`)).rows[0].id;
const earlyHost = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('h@test.local', '{"full_name":"Hana Host","role":"host"}') returning id`)).rows[0].id;

await db.exec(readFileSync(initial, "utf8"));
check("before backfill: early users have no profile", (await db.query(`select count(*)::int c from public.profiles`)).rows[0].c === 0);

// A user created after the schema but whose row was deleted (simulates any other gap)
const late = (await db.query(`insert into auth.users (email) values ('late@test.local') returning id`)).rows[0].id;
await db.query(`delete from public.profiles where id=$1`, [late]);

await db.exec(readFileSync(backfill, "utf8"));
await db.exec(readFileSync(backfill, "utf8")); // idempotent
const profiles = (await db.query(`select id, role, full_name from public.profiles order by full_name`)).rows;
check("backfill created all 3 profiles (and is idempotent)", profiles.length === 3, profiles);
check("early member is customer named Victor", profiles.find((p) => p.id === early)?.role === "customer" && profiles.find((p) => p.id === early)?.full_name === "Victor");
check("early host got host role + host profile", profiles.find((p) => p.id === earlyHost)?.role === "host" &&
  (await db.query(`select count(*)::int c from public.host_profiles where user_id=$1`, [earlyHost])).rows[0].c === 1);

// become_host for the early member
const hostId = (await as(early, (t) => t.query(`select public.become_host() id`))).rows[0].id;
check("become_host works for a backfilled member", !!hostId);
check("member is now host", (await db.query(`select role from public.profiles where id=$1`, [early])).rows[0].role === "host");

// ensure_profile self-heals a user whose profile vanished
const ghost = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('g@test.local', '{"full_name":"Gil","role":"admin"}') returning id`)).rows[0].id;
await db.query(`delete from public.profiles where id=$1`, [ghost]);
const ens = (await as(ghost, (t) => t.query(`select (public.ensure_profile()).role`))).rows[0].role;
check("ensure_profile recreates profile, never as admin", ens === "customer", ens);
let denied = false;
try { await db.transaction(async (t) => { await t.exec(`set local role anon;`); await t.query(`select public.ensure_profile()`); }); } catch { denied = true; }
check("anon cannot call ensure_profile", denied);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
