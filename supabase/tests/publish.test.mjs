// A host profile can only be published with tagline + description, a category, availability and a photo.
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
const attempt = (p) => p.then((r) => ({ ok: true, rows: r.rows }), (e) => ({ ok: false, error: e.message, detail: e.detail }));
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
const latest = files.at(-1);
for (const f of files.slice(0, -1)) await db.exec(readFileSync(f, "utf8"));

// A host that was already public (and incomplete) before the rule existed.
const oldU = (await one(`insert into auth.users (email, raw_user_meta_data) values ('old@x.com','{"full_name":"Olga","role":"host"}') returning id`)).id;
const oldH = (await one(`update public.host_profiles set is_published=true where user_id=$1 returning id`, [oldU])).id;
await db.exec(readFileSync(latest, "utf8"));
await db.exec(readFileSync(latest, "utf8")); // safe twice

console.log("\nPublishing needs a complete profile");
const u = (await one(`insert into auth.users (email, raw_user_meta_data) values ('host@x.com','{"full_name":"Hana","role":"host"}') returning id`)).id;
const h = (await one(`select id from public.host_profiles where user_id=$1`, [u])).id;
const publish = () => attempt(as(u, `update public.host_profiles set is_published=true where id=$1 returning id`, [h]));
const missing = async () => (await as(u, `select public.host_publish_missing($1) m`, [h])).rows[0].m;

let r = await publish();
check("empty profile can't be published", !r.ok && /Complete your profile/.test(r.error), r);
check("…and the database says what is missing", r.detail === "tagline_description,category,availability,photo", r.detail);
check("host_publish_missing lists the same 4 items", JSON.stringify(await missing()) === JSON.stringify(["tagline_description", "category", "availability", "photo"]));

await as(u, `update public.host_profiles set tagline='Oi!', description='' where id=$1`, [h]);
check("tagline without description still missing", (await missing()).includes("tagline_description"));
await as(u, `update public.host_profiles set description='Adoro conversar.', categories=array['talk'] where id=$1`, [h]);
await as(u, `insert into public.host_availability (host_id, day_of_week, start_time, end_time, timezone) values ($1, 1, '18:00', '22:00', 'America/Sao_Paulo')`, [h]);
r = await publish();
check("still no photo → refused", !r.ok && r.detail === "photo", r);
await as(u, `update public.profiles set avatar_url='https://exemplo.com/foto.jpg' where id=$1`, [u]);
check("nothing missing now", (await missing()).length === 0);
r = await publish();
check("complete profile publishes", r.ok && r.rows.length === 1, r);
check("…and shows in Explore", (await one(`select count(*)::int n from public.public_hosts where id=$1`, [h])).n === 1);

console.log("\nOther cases");
check("hiding and publishing again works while complete", (await attempt(as(u, `update public.host_profiles set is_published=false where id=$1`, [h]))).ok && (await publish()).ok);
check("editing other fields of a public profile is fine", (await attempt(as(u, `update public.host_profiles set is_available=true where id=$1`, [h]))).ok);
check("can't publish and blank the description in the same save", !(await attempt(as(u, `update public.host_profiles set is_published=false where id=$1`, [h]).then(() => as(u, `update public.host_profiles set is_published=true, description='' where id=$1`, [h])))).ok);
check("profiles that were already public stay public", (await one(`select is_published from public.host_profiles where id=$1`, [oldH])).is_published === true);
check("…but the rule applies if they hide and publish again", (await db.query(`update public.host_profiles set is_published=false where id=$1`, [oldH]), await attempt(db.query(`update public.host_profiles set is_published=true where id=$1`, [oldH]))).ok === false);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
