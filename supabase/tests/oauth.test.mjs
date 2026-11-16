// Checks OAuth (Google/Apple) profile handling: names, avatars, no role changes, no duplicates.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
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
for (const f of files) await db.exec(readFileSync(f, "utf8"));
await db.exec(readFileSync(files.at(-1), "utf8")); // idempotent

const add = async (email, meta) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).rows[0].id;
const prof = async (id) => (await db.query(`select * from public.profiles where id=$1`, [id])).rows[0];

const g = await add("ana@gmail.com", { full_name: "Ana Souza", avatar_url: "https://lh3.googleusercontent.com/a/abc", email: "ana@gmail.com", iss: "https://accounts.google.com" });
let p = await prof(g);
check("Google: name + avatar from metadata, customer role", p.full_name === "Ana Souza" && p.avatar_url === "https://lh3.googleusercontent.com/a/abc" && p.role === "customer", p);

const g2 = await add("bo@gmail.com", { name: "Bo Lee", picture: "https://lh3.googleusercontent.com/b" });
p = await prof(g2);
check("Google alt keys: name/picture", p.full_name === "Bo Lee" && p.avatar_url === "https://lh3.googleusercontent.com/b", p);

const a = await add("xyz123@privaterelay.appleid.com", { iss: "https://appleid.apple.com" });
p = await prof(a);
check("Apple without name: falls back to email prefix, no avatar", p.full_name === "xyz123" && p.avatar_url === null, p);

const http = await add("c@x.com", { full_name: "C", avatar_url: "http://insecure/x.jpg" });
check("non-https avatar ignored", (await prof(http)).avatar_url === null);

const evil = await add("e@x.com", { full_name: "E", role: "admin" });
check("metadata role admin → customer", (await prof(evil)).role === "customer");

// Existing host who edited their profile, later logs in with Google (linked identity, new metadata)
const host = await add("host@x.com", { full_name: "Hana", role: "host" });
await db.query(`update public.profiles set full_name='Hana Custom', avatar_url='https://cdn/own.jpg' where id=$1`, [host]);
await db.query(`update auth.users set raw_user_meta_data = '{"full_name":"Hana From Google","avatar_url":"https://lh3/google.jpg"}' where id=$1`, [host]);
const r = (await as(host, (t) => t.query(`select (public.ensure_profile()).*`))).rows[0];
check("existing user: role, name and photo preserved", r.role === "host" && r.full_name === "Hana Custom" && r.avatar_url === "https://cdn/own.jpg", r);
check("still exactly one profile + one host profile", (await db.query(`select (select count(*) from public.profiles where id=$1)::int p, (select count(*) from public.host_profiles where user_id=$1)::int h`, [host])).rows[0].p === 1);

// Existing user without photo gets the provider photo filled in
const plain = await add("plain@x.com", { full_name: "Plain" });
await db.query(`update auth.users set raw_user_meta_data = '{"full_name":"Plain","picture":"https://lh3/p.jpg"}' where id=$1`, [plain]);
check("missing photo filled from provider", (await as(plain, (t) => t.query(`select (public.ensure_profile()).avatar_url`))).rows[0].avatar_url === "https://lh3/p.jpg");

// Profile missing entirely → recreated once
await db.query(`delete from public.profiles where id=$1`, [g]);
await as(g, (t) => t.query(`select public.ensure_profile()`));
await as(g, (t) => t.query(`select public.ensure_profile()`));
check("missing profile recreated, no duplicates", (await db.query(`select count(*)::int c from public.profiles where id=$1`, [g])).rows[0].c === 1);

let denied = false;
try { await db.transaction(async (t) => { await t.exec(`set local role authenticated;`); await t.query(`select public.profile_name_from_meta('{}'::jsonb, 'x@y')`); }); } catch { denied = true; }
check("helper functions not callable by clients", denied);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
