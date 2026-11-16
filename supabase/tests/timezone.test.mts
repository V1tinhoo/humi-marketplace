// End-to-end time-zone checks: the instant the website computes is exactly what the
// database booking trigger accepts, across zones, calendar dates and DST.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";
import { buildSlots, timeInZone } from "../../src/lib/time.ts";

const files = process.argv.slice(2);
const db = new PGlite({ extensions: { btree_gist } });
let fail = 0;
const check = (n: string, c: boolean, i?: unknown) => { console.log(c ? "  PASS" : "  FAIL", n, c ? "" : JSON.stringify(i ?? "")); if (!c) fail++; };
const as = (uid: string, fn: (t: any) => Promise<any>) => db.transaction(async (t) => {
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

const user = async (email: string, meta: object) => (await db.query<{ id: string }>(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).rows[0].id;
const customer = await user("c@x.com", { full_name: "Cora" });
const customer2 = await user("d@x.com", { full_name: "Dan" });

/** Creates a published host in `tz` available on `dbDow` (0 = Sunday) from `start` to `end`. */
async function makeHost(email: string, tz: string, dbDow: number, start: string, end: string) {
  const uid = await user(email, { full_name: email, role: "host" });
  const hostId = (await db.query<{ id: string }>(`update public.host_profiles set is_published=true, timezone=$2 where user_id=$1 returning id`, [uid, tz])).rows[0].id;
  await db.query(`insert into public.host_availability (host_id, day_of_week, start_time, end_time, timezone) values ($1,$2,$3,$4,$5)`, [hostId, dbDow, start, end, tz]);
  return hostId;
}
const book = (cust: string, hostId: string, iso: string, minutes = 30) =>
  as(cust, (t) => t.query(`insert into public.bookings (customer_id, host_id, scheduled_at, duration_minutes, call_type) values ($1,$2,$3,$4,'audio') returning scheduled_at`, [cust, hostId, iso, minutes]))
    .then((r) => ({ ok: true as const, at: new Date(r.rows[0].scheduled_at as string) }), (e: Error) => ({ ok: false as const, error: e.message }));

/** First slot the website would offer for this host (same code as the booking page). */
function siteSlot(tz: string, uiDow: number, hour: number) {
  const days = buildSlots({ availability: { [uiDow]: [hour] }, timeZone: tz, durationMinutes: 30, days: 9 });
  return days.flatMap((d) => d.slots)[0].start;
}

console.log("\nSão Paulo host 21:00 (Tue), customer in New York");
{
  const host = await makeHost("sp@x.com", "America/Sao_Paulo", 2, "21:00", "22:00");
  const slot = siteSlot("America/Sao_Paulo", 1, 21);
  check("site shows the customer 19:00", timeInZone(slot, "America/New_York") === "19:00", timeInZone(slot, "America/New_York"));
  const r = await book(customer, host, slot.toISOString());
  check("database accepts the exact instant the site sent", r.ok, r);
  check("stored as the same UTC instant", r.ok && r.at.getTime() === slot.getTime());
  const late = await book(customer2, host, new Date(slot.getTime() + 60 * 60_000).toISOString());
  check("one hour later (22:00 São Paulo) is rejected: outside availability", !late.ok && /outside/.test(late.error), late);
  const overlap = await book(customer2, host, new Date(slot.getTime() + 15 * 60_000).toISOString(), 20);
  check("overlapping booking by another customer is rejected", !overlap.ok && /overlap/.test(overlap.error), overlap);
}

console.log("\nAuckland host Mon 08:00 — that's still Sunday in UTC");
{
  const host = await makeHost("akl@x.com", "Pacific/Auckland", 1, "08:00", "09:00");
  const slot = siteSlot("Pacific/Auckland", 0, 8);
  check("instant falls on a Sunday in UTC", slot.getUTCDay() === 0, slot.toISOString());
  const r = await book(customer, host, slot.toISOString());
  check("database validates by the HOST's local day (Monday) and accepts", r.ok, r);
}

console.log("\nKolkata host 10:00 (half-hour offset), customer in London");
{
  const host = await makeHost("in@x.com", "Asia/Kolkata", 3, "10:00", "11:00");
  const slot = siteSlot("Asia/Kolkata", 2, 10);
  check("customer sees 04:30", timeInZone(slot, "Europe/London") === "04:30", timeInZone(slot, "Europe/London"));
  const r = await book(customer, host, slot.toISOString());
  check("database accepts it", r.ok, r);
}

console.log("\nDaylight saving is applied by the database's own time-zone rules");
{
  const q = async (iso: string, tz: string) =>
    (await db.query<{ t: string }>(`select to_char($1::timestamptz at time zone $2, 'YYYY-MM-DD HH24:MI') t`, [iso, tz])).rows[0].t;
  check("NY before DST start (Mar 8 2027 14:00Z → 09:00)", (await q("2027-03-08T14:00:00Z", "America/New_York")) === "2027-03-08 09:00");
  check("NY after DST start (Mar 15 2027 14:00Z → 10:00)", (await q("2027-03-15T14:00:00Z", "America/New_York")) === "2027-03-15 10:00");
  check("Sydney after DST end (Apr 5 2027 → UTC+10)", (await q("2027-04-05T00:00:00Z", "Australia/Sydney")) === "2027-04-05 10:00");
}

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
