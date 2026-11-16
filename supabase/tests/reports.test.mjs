// User reports: who can report whom, privacy, duplicates and limits.
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
for (const f of files) await db.exec(readFileSync(f, "utf8"));
await db.exec(readFileSync(files.at(-1), "utf8")); // idempotent

const user = async (email, meta) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).id;
const hostUser = await user("h@x.com", { full_name: "Hana", role: "host" });
const ana = await user("ana@x.com", { full_name: "Ana" });
const bia = await user("bia@x.com", { full_name: "Bia" });
const hostId = (await one(`update public.host_profiles set is_published=true where user_id=$1 returning id`, [hostUser])).id;
// A call between Ana and the host (inserted as owner; billing isn't the subject here).
const callId = (await one(`insert into public.call_sessions (customer_id, host_id, call_type, price_cents_per_minute, commission_bps, room_name) values ($1,$2,'audio',100,2500,'r1') returning id`, [ana, hostId])).id;

const report = (uid, args) => attempt(as(uid, `select public.report_user($1::public.report_reason, $2, $3, $4, $5) id`,
  [args.reason ?? "harassment", args.details ?? null, args.call ?? null, args.booking ?? null, args.host ?? null]));

console.log("\nReporting");
const r1 = await report(ana, { call: callId, details: "Rude during the call" });
check("customer reports the host from a call", r1.ok, r1);
check("…and the host is the reported user", (await one(`select reported_user_id from public.user_reports where id=$1`, [r1.rows?.[0]?.id])).reported_user_id === hostUser);
const r2 = await report(hostUser, { call: callId, reason: "spam_or_scam" });
check("host reports the customer from the same call", r2.ok && (await one(`select reported_user_id from public.user_reports where id=$1`, [r2.rows[0].id])).reported_user_id === ana, r2);
const r3 = await report(bia, { call: callId });
check("someone who wasn't in the call can't report through it", !r3.ok, r3);
const r4 = await report(bia, { host: hostId, reason: "inappropriate_content" });
check("anyone signed in can report a host's profile", r4.ok, r4);
const r5 = await report(hostUser, { host: hostId });
check("a host can't report their own profile", !r5.ok, r5);
const again = await report(ana, { call: callId, details: "double click" });
check("same report twice in a row is not duplicated", again.ok && again.rows[0].id === r1.rows[0].id);
const two = await report(ana, { call: callId, host: hostId });
check("must pick exactly one of call / booking / profile", !two.ok, two);
const anon = await attempt(run("anon", null, `select public.report_user('other', null, $1, null, null)`, [callId]));
check("visitors (not logged in) can't report", !anon.ok, anon);

console.log("\nPrivacy");
check("reporter sees only their own reports", (await as(ana, `select reporter_id from public.user_reports`)).rows.every((r) => r.reporter_id === ana));
check("the reported host can't see reports about them", (await as(hostUser, `select * from public.user_reports where reported_user_id=$1`, [hostUser])).rows.length === 0);
check("nobody can insert reports directly (only via the function)", !(await attempt(as(bia, `insert into public.user_reports (reporter_id, reported_user_id, context, reason) values ($1,$2,'profile','other')`, [bia, hostUser]))).ok);
check("nobody can edit or delete a report", !(await attempt(as(ana, `update public.user_reports set status='dismissed'`))).ok && !(await attempt(as(ana, `delete from public.user_reports`))).ok);

console.log("\nPublic settings (fix)");
const anonSettings = await attempt(run("anon", null, `select key from public.platform_settings`));
check("visitors can read public settings without an error", anonSettings.ok, anonSettings);
check("…but not the commission rate", anonSettings.ok && !anonSettings.rows.some((r) => r.key === "commission_bps"));
check("signed-in users don't see the commission rate either", !(await as(ana, `select key from public.platform_settings`)).rows.some((r) => r.key === "commission_bps"));

console.log("\nAbuse limit");
const others = [];
for (let i = 0; i < 10; i++) {
  const h = await user(`x${i}@x.com`, { full_name: `H${i}`, role: "host" });
  others.push((await one(`update public.host_profiles set is_published=true where user_id=$1 returning id`, [h])).id);
}
let lastOk = true;
for (const h of others) lastOk = (await report(bia, { host: h })).ok;
check("more than 10 reports a day from one person are refused", !lastOk);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
