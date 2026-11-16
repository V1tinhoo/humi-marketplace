// total_sessions counts real calls (billed time), once each.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const db = new PGlite({ extensions: { btree_gist } });
let fail = 0;
const check = (n, c, i) => { console.log(c ? "  PASS" : "  FAIL", n, c ? "" : JSON.stringify(i ?? "")); if (!c) fail++; };
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const svc = (sql, params = []) => db.transaction(async (t) => { await t.exec(`set local role service_role;`); return t.query(sql, params); });

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);
const migrations = files.slice(0, -1);
for (const f of migrations) await db.exec(readFileSync(f, "utf8"));

const user = async (email, meta) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).id;
const hostUser = await user("h@x.com", { full_name: "Hana", role: "host" });
const ana = await user("a@x.com", { full_name: "Ana" });
const hostId = (await one(`update public.host_profiles set is_published=true where user_id=$1 returning id`, [hostUser])).id;
const sessions = async () => Number((await one(`select total_sessions from public.host_profiles where id=$1`, [hostId])).total_sessions);
const call = async (billed, status = "connected") =>
  (await one(`insert into public.call_sessions (customer_id, host_id, call_type, price_cents_per_minute, commission_bps, room_name, status, billed_seconds)
              values ($1,$2,'audio',100,2500,'r'||gen_random_uuid(),$3,$4) returning id`, [ana, hostId, status, billed])).id;

// Calls made BEFORE the fix (simulates your existing data): 3 real calls + 1 that never connected.
for (const billed of [17, 133, 193]) {
  const id = await call(billed);
  await db.query(`update public.call_sessions set status='ended' where id=$1`, [id]);
}
const oldFail = await call(0, "ringing");
await db.query(`update public.call_sessions set status='failed' where id=$1`, [oldFail]);
check("before the fix: calls didn't count (0)", (await sessions()) === 0);

await db.exec(readFileSync(files.at(-1), "utf8"));
check("migration recounts existing calls → 3", (await sessions()) === 3, await sessions());
await db.exec(readFileSync(files.at(-1), "utf8"));
check("running it again doesn't double count", (await sessions()) === 3);

console.log("\nNew calls");
const c = await call(0);
await svc(`select public.finish_call($1,'customer_hangup')`, [c]);
check("a call with no billed time doesn't count", (await sessions()) === 3);
const c2 = await call(60);
await svc(`select public.finish_call($1,'host_hangup')`, [c2]);
check("a real call counts when it ends → 4", (await sessions()) === 4);
await svc(`select public.finish_call($1,'host_hangup')`, [c2]);
check("ending it twice doesn't count twice", (await sessions()) === 4);
const c3 = await call(0, "ringing");
await svc(`select public.finish_call($1,'declined')`, [c3]);
check("a declined/failed call doesn't count", (await sessions()) === 4);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
