// New hosts start at R$ 0,50 (audio) / R$ 0,70 (video); existing prices are kept.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const db = new PGlite({ extensions: { btree_gist } });
let fail = 0;
const check = (n, c, i) => { console.log(c ? "  PASS" : "  FAIL", n, c ? "" : JSON.stringify(i ?? "")); if (!c) fail++; };
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
for (const f of files.slice(0, -1)) await db.exec(readFileSync(f, "utf8"));
const host = async (email) => {
  const u = (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,'{"full_name":"H","role":"host"}') returning id`, [email])).id;
  return one(`select pr.audio_cents_per_minute a, pr.video_cents_per_minute v from public.host_profiles h join public.host_pricing pr on pr.host_id=h.id where h.user_id=$1`, [u]);
};
const before = await host("old@x.com");
await db.exec(readFileSync(files.at(-1), "utf8"));
await db.exec(readFileSync(files.at(-1), "utf8")); // safe twice

const now = await host("new@x.com");
check("new host starts at R$ 0,50 audio / R$ 0,70 video", now.a === 50 && now.v === 70, now);
const old = await one(`select pr.audio_cents_per_minute a, pr.video_cents_per_minute v from public.host_profiles h join public.host_pricing pr on pr.host_id=h.id join auth.users u on u.id=h.user_id where u.email='old@x.com'`);
check("existing host keeps the price it had", old.a === before.a && old.v === before.v, { before, old });
check("both are inside the site limits", now.a >= Number((await one(`select value from public.platform_settings where key='price_min_cents_per_minute'`)).value));

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
