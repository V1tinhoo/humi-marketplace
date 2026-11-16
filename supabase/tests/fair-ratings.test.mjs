// Fair ratings: one person counts once per host; only calls of 1 minute or more can be rated.
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
const anon = (sql, params) => run("anon", null, sql, params);
const svc = (sql, params) => run("service_role", null, sql, params);
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
const latest = files.at(-1);
for (const f of files.slice(0, -1)) await db.exec(readFileSync(f, "utf8"));

const user = async (email, meta) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).id;
const hostUser = await user("host@x.com", { full_name: "Hana", role: "host" });
const hostId = (await one(`update public.host_profiles set is_published=true where user_id=$1 returning id`, [hostUser])).id;
await as(hostUser, `select public.set_host_pricing(100, null)`);
const pay = async (uid, cents) => {
  const t = (await as(uid, `select * from public.create_topup($1,$2,'pix')`, [cents, "mercadopago"])).rows[0];
  await svc(`select * from public.confirm_topup($1,$2,$3,$4,'approved','pix')`, [t.id, "mercadopago", "p_" + t.id.slice(0, 8), cents]);
};
// A finished call with the given billed seconds (billing itself is tested elsewhere).
const call = async (uid, secs) => {
  const c = (await as(uid, `select * from public.start_call($1,'audio')`, [hostId])).rows[0];
  await db.query(`update public.call_sessions set status='ended', end_reason='customer_hangup', ended_at=now(), connected_at=now(), billed_seconds=$2 where id=$1`, [c.id, secs]);
  return c.id;
};
const rate = (uid, callId, stars) => attempt(as(uid, `select public.rate_call($1,$2,null)`, [callId, stars]));
const host = async () => {
  const h = await one(`select average_rating a, review_count n from public.host_profiles where id=$1`, [hostId]);
  return { avg: Number(h.a), n: Number(h.n) };
};
const ana = await user("ana@x.com", { full_name: "Ana" });
const bia = await user("bia@x.com", { full_name: "Bia" });
const rex = await user("rex@x.com", { full_name: "Rex" });
for (const u of [ana, bia, rex]) await pay(u, 10000);

console.log("\nBefore the migration (the problem)");
for (let i = 0; i < 4; i++) await rate(rex, await call(rex, 1), 1); // 4 one-second calls, 1 star each
await rate(ana, await call(ana, 300), 5);
let h = await host();
check("old rules: Rex's 4 one-second calls pull the host to 1.8", h.n === 5 && h.avg === 1.8, h);

await db.exec(readFileSync(latest, "utf8"));
await db.exec(readFileSync(latest, "utf8")); // safe twice

console.log("\nAfter the migration");
h = await host();
check("recalculated: only Ana's 5 stars count (Rex's calls were under 1 minute)", h.n === 1 && h.avg === 5, h);
const short = await rate(bia, await call(bia, 59), 1);
check("a 59-second call can't be rated", !short.ok && /at least 1 minute/.test(short.error), short);
const hostShort = await attempt(as(hostUser, `select public.rate_call($1,4,null)`, [await call(bia, 30)]));
check("…not by the host either", !hostShort.ok && /at least 1 minute/.test(hostShort.error), hostShort);
const direct = await attempt(as(bia, `insert into public.reviews (call_id, customer_id, host_id, rating) values ($1,$2,$3,1)`, [await call(bia, 10), bia, hostId]));
check("…and not by writing the review directly", !direct.ok, direct);

console.log("\nOne person counts once");
await rate(bia, await call(bia, 120), 2);
await rate(bia, await call(bia, 120), 2);
await rate(bia, await call(bia, 120), 2);
h = await host();
check("Bia rated 3 calls: she counts once (2 reviews, avg 3.5)", h.n === 2 && h.avg === 3.5, h);
await db.query(`update public.reviews set created_at = created_at - interval '1 hour' where customer_id=$1`, [bia]);
await rate(bia, await call(bia, 90), 4);
h = await host();
check("her most recent review is the one that counts (avg 4.5)", h.n === 2 && h.avg === 4.5, h);
const pub = (await anon(`select author_name, rating from public.public_reviews where host_id=$1 order by author_name`, [hostId])).rows;
check("public list shows one review per person", pub.length === 2 && pub.find((r) => r.author_name === "Bia")?.rating === 4, pub);
check("older reviews are kept (not deleted)", (await one(`select count(*)::int n from public.reviews where customer_id=$1`, [bia])).n === 4);
check("visitors can't read the counting view directly", !(await attempt(anon(`select 1 from public.counted_reviews`))).ok);
const lastAna = (await one(`select call_id from public.reviews where customer_id=$1`, [ana])).call_id;
await rate(ana, lastAna, 3);
h = await host();
check("editing a review still updates the average (avg 3.5)", h.n === 2 && h.avg === 3.5, h);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
