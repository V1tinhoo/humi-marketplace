// Checks the region migration on top of the existing schema.
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

const upd = await as(host, (t) => t.query(`update public.profiles set region='São Paulo', country='Brazil' where id=$1 returning region`, [host]));
check("user can set own region", upd.rows[0]?.region === "São Paulo");
const otherUpd = await as(other, (t) => t.query(`update public.profiles set region='X' where id=$1 returning id`, [host]));
check("cannot set someone else's region", otherUpd.rows.length === 0);
let tooLong = false;
try { await as(host, (t) => t.query(`update public.profiles set region=repeat('a', 81) where id=$1`, [host])); } catch { tooLong = true; }
check("region longer than 80 chars rejected", tooLong);

await as(host, (t) => t.query(`update public.host_profiles set is_published=true where user_id=$1`, [host]));
const pub = await as("anon", (t) => t.query(`select display_name, region, country from public.public_hosts`));
check("public_hosts exposes region", pub.rows[0]?.region === "São Paulo" && pub.rows[0]?.country === "Brazil", pub.rows);
check("view still hides user_id/full_name", !("user_id" in pub.rows[0]) && !("full_name" in pub.rows[0]));
let viewWrite = false;
try { await as("anon", (t) => t.query(`update public.public_hosts set region='x'`)); } catch { viewWrite = true; }
check("view not writable", viewWrite);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
