// "Online now" on by default, 90 s presence window, offline beacon, price range R$ 1–5/min.
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
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);
const latest = files.at(-1);
for (const f of files.slice(0, -1)) await db.exec(readFileSync(f, "utf8"));

const user = async (email, meta) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).id;
// A host created BEFORE the change, with the switch off and an expensive price.
const oldHost = await user("old@x.com", { full_name: "Olga", role: "host" });
await db.query(`update public.host_profiles set is_published = true, is_available = false where user_id=$1`, [oldHost]);
await as(oldHost, `select public.set_host_pricing(2000, 1500)`);

await db.exec(readFileSync(latest, "utf8"));
await db.exec(readFileSync(latest, "utf8")); // safe to run twice

console.log("\n'Online now' on by default");
const newHost = await user("new@x.com", { full_name: "Nina", role: "host" });
const hostId = (await one(`update public.host_profiles set is_published = true where user_id=$1 returning id, is_available`, [newHost]));
check("a new host starts with 'Online now' ON", hostId.is_available === true);
check("existing hosts were switched ON", (await one(`select is_available a from public.host_profiles where user_id=$1`, [oldHost])).a === true);
check("the host can still switch it OFF", (await attempt(as(newHost, `update public.host_profiles set is_available = false where user_id = $1`, [newHost]))).ok
  && (await one(`select is_available a from public.host_profiles where user_id=$1`, [newHost])).a === false);
await db.query(`update public.host_profiles set is_available = true where user_id=$1`, [newHost]);

console.log("\nPresence (leaving the browser)");
const online = async () => (await one(`select is_online o from public.public_hosts where id=$1`, [hostId.id])).o;
await as(newHost, `select public.host_presence(true)`);
check("heartbeat now → online", (await online()) === true);
await db.query(`update public.host_profiles set last_seen_at = now() - interval '60 seconds' where user_id=$1`, [newHost]);
check("last heartbeat 60 s ago → still online (heartbeat runs every 30 s)", (await online()) === true);
await db.query(`update public.host_profiles set last_seen_at = now() - interval '100 seconds' where user_id=$1`, [newHost]);
check("no heartbeat for 100 s (browser closed / no signal) → offline", (await online()) === false);
await as(newHost, `select public.host_presence(true)`);
await as(newHost, `select public.host_presence(false)`); // what the offline beacon calls
check("tab closed (offline beacon) → offline immediately", (await online()) === false);

console.log("\nPrice per minute R$ 1,00 – R$ 5,00");
const price = await one(`select audio_cents_per_minute a, video_cents_per_minute v from public.host_pricing hp join public.host_profiles h on h.id = hp.host_id where h.user_id=$1`, [oldHost]);
check("existing expensive prices clamped to R$ 5,00", price.a === 500 && price.v === 500, price);
check("R$ 6,00/min rejected", !(await attempt(as(newHost, `select public.set_host_pricing(600, null)`))).ok);
check("R$ 0,50/min rejected", !(await attempt(as(newHost, `select public.set_host_pricing(50, null)`))).ok);
check("R$ 3,00/min accepted", (await attempt(as(newHost, `select public.set_host_pricing(300, null)`))).ok);
check("R$ 1,00 and R$ 5,00 accepted (limits included)", (await attempt(as(newHost, `select public.set_host_pricing(100, 500)`))).ok);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
