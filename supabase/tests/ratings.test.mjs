// End-of-call ratings: guest → host (public review), host → guest (private).
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
const db = new PGlite({ extensions: { btree_gist } });
let fail = 0;
const check = (n, c, i) => { console.log(c ? "  PASS" : "  FAIL", n, c ? "" : JSON.stringify(i ?? "")); if (!c) fail++; };
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const as = (uid, sql, params = []) =>
  db.transaction(async (t) => {
    await t.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`);
    return t.query(sql, params);
  });
const fails = async (fn) => { try { await fn(); return false; } catch { return true; } };

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
for (const f of files) await db.exec(readFileSync(f, "utf8"));
await db.exec(readFileSync(files.at(-1), "utf8")); // idempotent

const user = async (email, meta) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).id;
const hostUser = await user("h@x.com", { full_name: "Hana", role: "host" });
const ana = await user("a@x.com", { full_name: "Ana" });
const bob = await user("b@x.com", { full_name: "Bob" });
const hostId = (await one(`update public.host_profiles set is_published=true where user_id=$1 returning id`, [hostUser])).id;
const call = async (billed, status = "ended") =>
  (await one(`insert into public.call_sessions (customer_id, host_id, call_type, price_cents_per_minute, commission_bps, room_name, status, billed_seconds)
              values ($1,$2,'audio',100,2500,'r'||gen_random_uuid(),$3,$4) returning id`, [ana, hostId, status, billed])).id;
const host = async () => one(`select average_rating::float as avg, review_count from public.host_profiles where id=$1`, [hostId]);

const done = await call(120);
const res = await as(ana, `select public.rate_call($1, 5, 'Lovely chat') as r`, [done]);
check("guest rates the host → public review", res.rows[0].r === "host");
let h = await host();
check("host rating updated (5.0, 1 review)", h.avg === 5 && h.review_count === 1, h);
const pub = await one(`select comment, author_name from public.public_reviews where host_id=$1`, [hostId]);
check("review shows publicly with first name", pub?.comment === "Lovely chat" && pub.author_name === "Ana", pub);

await as(ana, `select public.rate_call($1, 3, null)`, [done]);
h = await host();
check("rating again edits instead of duplicating", h.avg === 3 && h.review_count === 1, h);
const mine = (await as(ana, `select * from public.my_call_rating($1)`, [done])).rows[0];
check("guest sees own rating", mine?.rating === 3, mine);

const g = await as(hostUser, `select public.rate_call($1, 4, 'Polite') as r`, [done]);
check("host rates the guest → private", g.rows[0].r === "guest");
check("host sees own guest rating", (await as(hostUser, `select * from public.my_call_rating($1)`, [done])).rows[0]?.rating === 4);
check("guest can't read the host's rating of them", (await as(ana, `select count(*)::int n from public.guest_ratings`)).rows[0].n === 0);
check("host rating didn't change the host's public score", (await host()).review_count === 1);

check("someone not in the call can't rate", await fails(() => as(bob, `select public.rate_call($1, 1)`, [done])));
const zero = await call(0);
check("call with no billed time can't be rated", await fails(() => as(ana, `select public.rate_call($1, 5)`, [zero])));
await db.query(`update public.call_sessions set status='failed' where id=$1`, [zero]);
const live = await call(30, "connected");
check("call still in progress can't be rated", await fails(() => as(ana, `select public.rate_call($1, 5)`, [live])));
check("6 stars rejected", await fails(() => as(ana, `select public.rate_call($1, 6)`, [done])));
check("direct insert into reviews blocked for calls", await fails(() => as(bob, `insert into public.reviews (call_id, customer_id, host_id, rating) values ($1,$2,$3,5)`, [done, bob, hostId])));

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
