// Runs the HUMI migration against PGlite with a minimal Supabase-like auth stub, then checks RLS and business rules.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";

const migrationPath = process.argv[2];
const db = new PGlite({ extensions: { btree_gist } });

let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log("  PASS", name); };
const bad = (name, info) => { fail++; console.log("  FAIL", name, info ?? ""); };

async function as(uid, fn) {
  // Mimic PostgREST: switch role + set JWT sub claim inside a transaction.
  return db.transaction(async (tx) => {
    if (uid === "anon") await tx.exec(`set local role anon; select set_config('request.jwt.claim.sub', '', true);`);
    else await tx.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`);
    return fn(tx);
  });
}
async function expectOk(name, p, check) {
  try { const r = await p; if (check && !check(r)) bad(name, JSON.stringify(r?.rows ?? r)); else ok(name); return r; }
  catch (e) { bad(name, e.message); }
}
async function expectErr(name, p, re) {
  try { const r = await p; bad(name, "expected error, got " + JSON.stringify(r?.rows ?? r)); }
  catch (e) { if (re && !re.test(e.message)) bad(name, "wrong error: " + e.message); else ok(`${name} → ${e.message.slice(0, 70)}`); }
}

// ---- Supabase stubs ----
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);

await expectOk("migration applies cleanly", db.exec(readFileSync(migrationPath, "utf8")));

// ---- users ----
const ins = async (email, meta) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta])).rows[0].id;
const host = await ins("alex@test.local", { full_name: "Alex Silva", role: "host" });
const cust = await ins("hannah@test.local", { full_name: "Hannah Weber", role: "customer" });
const cust2 = await ins("sam@test.local", { full_name: "Sam", role: "customer" });
const sneaky = await ins("evil@test.local", { full_name: "Evil", role: "admin" });

console.log("\nSign-up trigger");
await expectOk("profiles created for every user", db.query(`select count(*)::int c from public.profiles`), (r) => r.rows[0].c === 4);
await expectOk("'admin' in metadata is downgraded to customer", db.query(`select role from public.profiles where id=$1`, [sneaky]), (r) => r.rows[0].role === "customer");
const hostProfileId = (await db.query(`select id from public.host_profiles where user_id=$1`, [host])).rows[0]?.id;
hostProfileId ? ok("host signup creates host_profiles row") : bad("host signup creates host_profiles row");

console.log("\nProfiles & column privileges");
await expectOk("user updates own bio", as(cust, (t) => t.query(`update public.profiles set bio='hi', country='Germany' where id=$1 returning id`, [cust])), (r) => r.rows.length === 1);
await expectErr("user cannot change own role", as(cust, (t) => t.query(`update public.profiles set role='admin' where id=$1`, [cust])), /permission denied/);
await expectOk("user cannot update someone else's profile (0 rows)", as(cust, (t) => t.query(`update public.profiles set bio='x' where id=$1 returning id`, [host])), (r) => r.rows.length === 0);
await expectOk("user cannot read other profiles", as(cust, (t) => t.query(`select id from public.profiles`)), (r) => r.rows.length === 1 && r.rows[0].id === cust);
await expectOk("anon reads no profiles", as("anon", (t) => t.query(`select id from public.profiles`)), (r) => r.rows.length === 0);

console.log("\nHost setup");
await expectOk("host updates own host profile", as(host, (t) => t.query(
  `update public.host_profiles set tagline='Games & movies', session_price=5, categories='{play,talk}', timezone='America/Sao_Paulo', is_published=true, is_available=true where user_id=$1 returning id`, [host])), (r) => r.rows.length === 1);
await expectErr("host cannot self-verify", as(host, (t) => t.query(`update public.host_profiles set is_verified=true where user_id=$1`, [host])), /permission denied/);
await expectErr("host cannot fake rating", as(host, (t) => t.query(`update public.host_profiles set average_rating=5 where user_id=$1`, [host])), /permission denied/);
await expectErr("price above platform limit rejected", as(host, (t) => t.query(`update public.host_profiles set session_price=99 where user_id=$1`, [host])), /check constraint/);
await expectErr("invalid timezone rejected", as(host, (t) => t.query(`update public.host_profiles set timezone='Mars/Base' where user_id=$1`, [host])), /Unknown time zone/);
await expectOk("host adds Monday 09-12 availability", as(host, (t) => t.query(
  `insert into public.host_availability (host_id, day_of_week, start_time, end_time, timezone) values ($1, 1, '09:00', '12:00', 'America/Sao_Paulo') returning id`, [hostProfileId])), (r) => r.rows.length === 1);
await expectErr("customer cannot add availability for the host", as(cust, (t) => t.query(
  `insert into public.host_availability (host_id, day_of_week, start_time, end_time) values ($1, 2, '09:00', '12:00')`, [hostProfileId])), /row-level security/);

console.log("\nPublic marketplace views");
await expectOk("anon sees published host via public_hosts", as("anon", (t) => t.query(`select * from public.public_hosts`)), (r) => r.rows.length === 1 && r.rows[0].availability.length === 1);
await expectOk("public_hosts exposes no full_name / user_id", as("anon", (t) => t.query(`select * from public.public_hosts`)), (r) => !("full_name" in r.rows[0]) && !("user_id" in r.rows[0]));
await expectErr("anon cannot read host_profiles table directly", as("anon", (t) => t.query(`select * from public.host_profiles`)).then((r) => { if (r.rows.length === 0) throw new Error("0 rows (RLS)"); return r; }), /0 rows/);
await expectErr("anon cannot write through public_hosts", as("anon", (t) => t.query(`update public.public_hosts set session_price=3`)), /permission denied|cannot update view/);

// Next Monday 10:00 in São Paulo (≥ 1 day ahead)
const slot = (h) => `((date_trunc('week', now() at time zone 'America/Sao_Paulo') + interval '7 days' + interval '${h} hours') at time zone 'America/Sao_Paulo')`;

console.log("\nBookings");
const b1 = await expectOk("customer books 30-min video; client prices ignored", as(cust, (t) => t.query(
  `insert into public.bookings (customer_id, host_id, scheduled_at, duration_minutes, call_type, total_price, platform_fee, host_earnings, status)
   values ($1, $2, ${slot(10)}, 30, 'video', 0.01, 0, 0.01, 'completed') returning *`, [cust, hostProfileId])),
  (r) => { const b = r.rows[0]; return b.status === "pending" && b.subtotal === "6.00" && b.total_price === "6.60" && b.platform_fee === "1.20" && b.host_earnings === "5.40"; });
const booking1 = b1?.rows[0]?.id;
await expectErr("customer cannot book for someone else", as(cust, (t) => t.query(
  `insert into public.bookings (customer_id, host_id, scheduled_at, duration_minutes, call_type) values ($1, $2, ${slot(11)}, 30, 'audio')`, [cust2, hostProfileId])), /row-level security|for yourself/);
await expectErr("overlapping booking rejected", as(cust2, (t) => t.query(
  `insert into public.bookings (customer_id, host_id, scheduled_at, duration_minutes, call_type) values ($1, $2, ${slot(10)} + interval '15 minutes', 20, 'audio')`, [cust2, hostProfileId])), /bookings_no_overlap/);
await expectErr("booking outside availability rejected", as(cust2, (t) => t.query(
  `insert into public.bookings (customer_id, host_id, scheduled_at, duration_minutes, call_type) values ($1, $2, ${slot(15)}, 30, 'audio')`, [cust2, hostProfileId])), /outside/);
await expectErr("booking that runs past the window rejected", as(cust2, (t) => t.query(
  `insert into public.bookings (customer_id, host_id, scheduled_at, duration_minutes, call_type) values ($1, $2, ${slot(11)} + interval '30 minutes', 60, 'audio')`, [cust2, hostProfileId])), /outside/);
await expectErr("host cannot book themselves", as(host, (t) => t.query(
  `insert into public.bookings (customer_id, host_id, scheduled_at, duration_minutes, call_type) values ($1, $2, ${slot(11)}, 30, 'audio')`, [host, hostProfileId])), /yourself/);
await expectErr("anon cannot book", as("anon", (t) => t.query(
  `insert into public.bookings (customer_id, host_id, scheduled_at, duration_minutes, call_type) values ($1, $2, ${slot(11)}, 30, 'audio')`, [cust, hostProfileId])), /permission denied|row-level/);
await expectOk("second customer books 11:00 audio 60 min", as(cust2, (t) => t.query(
  `insert into public.bookings (customer_id, host_id, scheduled_at, duration_minutes, call_type) values ($1, $2, ${slot(11)}, 60, 'audio') returning total_price`, [cust2, hostProfileId])), (r) => r.rows[0].total_price === "10.18");
await expectErr("customer cannot update booking directly", as(cust, (t) => t.query(`update public.bookings set total_price=0 where id=$1`, [booking1])), /permission denied/);
await expectOk("customer sees only own bookings", as(cust, (t) => t.query(`select id from public.bookings`)), (r) => r.rows.length === 1);
await expectOk("host sees both incoming bookings (table)", as(host, (t) => t.query(`select id from public.bookings`)), (r) => r.rows.length === 2);
await expectOk("host view shows first name only", as(host, (t) => t.query(`select customer_name from public.my_host_bookings order by scheduled_at`)), (r) => r.rows.map((x) => x.customer_name).join() === "Hannah,Sam");
await expectOk("customer sees nothing in my_host_bookings", as(cust, (t) => t.query(`select * from public.my_host_bookings`)), (r) => r.rows.length === 0);
await expectOk("anon busy slots (no customer info)", as("anon", (t) => t.query(`select * from public.get_host_busy_slots($1, now(), now() + interval '30 days')`, [hostProfileId])), (r) => r.rows.length === 2 && Object.keys(r.rows[0]).join() === "scheduled_at,ends_at");

console.log("\nPayments");
await expectOk("demo payment row created", as(cust, (t) => t.query(`select status, amount, payment_provider from public.payments`)), (r) => r.rows.length === 1 && r.rows[0].status === "demo" && r.rows[0].amount === "6.60");
await expectOk("host cannot read payments", as(host, (t) => t.query(`select * from public.payments`)), (r) => r.rows.length === 0);
await expectOk("anon cannot read payments", as("anon", (t) => t.query(`select * from public.payments`)).catch((e) => ({ rows: [], e })), (r) => r.rows.length === 0);
await expectErr("customer cannot mark payment succeeded", as(cust, (t) => t.query(`update public.payments set status='succeeded'`)), /permission denied/);
await expectErr("customer cannot insert payments", as(cust, (t) => t.query(`insert into public.payments (booking_id, customer_id, amount) values ($1,$2,1)`, [booking1, cust])), /permission denied/);

console.log("\nStatus transitions & reviews");
await expectErr("review before completion rejected", as(cust, (t) => t.query(`insert into public.reviews (booking_id, customer_id, host_id, rating) values ($1,$2,$3,5)`, [booking1, cust, hostProfileId])), /row-level security|completed/);
await expectErr("customer cannot confirm", as(cust, (t) => t.query(`select public.confirm_booking($1)`, [booking1])), /can't be confirmed/);
await expectOk("host confirms", as(host, (t) => t.query(`select (public.confirm_booking($1)).status`, [booking1])), (r) => r.rows[0].status === "confirmed");
await expectErr("host can't complete before it ends", as(host, (t) => t.query(`select public.complete_booking($1)`, [booking1])), /completed yet/);
// time travel: move the session into the past (as owner)
await db.query(`update public.bookings set scheduled_at = now() - interval '2 hours', ends_at = now() - interval '90 minutes' where id=$1`, [booking1]);
await expectOk("host completes after session end", as(host, (t) => t.query(`select (public.complete_booking($1)).status`, [booking1])), (r) => r.rows[0].status === "completed");
await expectOk("total_sessions incremented", db.query(`select total_sessions from public.host_profiles where id=$1`, [hostProfileId]), (r) => r.rows[0].total_sessions === 1);
await expectErr("other customer cannot review it", as(cust2, (t) => t.query(`insert into public.reviews (booking_id, customer_id, host_id, rating) values ($1,$2,$3,1)`, [booking1, cust2, hostProfileId])), /row-level security|own completed/);
await expectOk("customer reviews completed session", as(cust, (t) => t.query(`insert into public.reviews (booking_id, customer_id, host_id, rating, comment) values ($1,$2,$3,4,'Great') returning id`, [booking1, cust, hostProfileId])), (r) => r.rows.length === 1);
await expectErr("only one review per booking", as(cust, (t) => t.query(`insert into public.reviews (booking_id, customer_id, host_id, rating) values ($1,$2,$3,5)`, [booking1, cust, hostProfileId])), /duplicate key/);
await expectOk("rating aggregate updated", db.query(`select average_rating, review_count from public.host_profiles where id=$1`, [hostProfileId]), (r) => r.rows[0].average_rating === "4.00" && r.rows[0].review_count === 1);
await expectOk("public_reviews shows first name, no customer_id", as("anon", (t) => t.query(`select * from public.public_reviews`)), (r) => r.rows[0].author_name === "Hannah" && !("customer_id" in r.rows[0]));
const b2 = (await db.query(`select id from public.bookings where customer_id=$1`, [cust2])).rows[0].id;
await expectErr("unrelated user cannot cancel", as(cust, (t) => t.query(`select public.cancel_booking($1)`, [b2])), /can't be cancelled/);
await expectOk("customer cancels own booking", as(cust2, (t) => t.query(`select (public.cancel_booking($1)).status`, [b2])), (r) => r.rows[0].status === "cancelled");
await expectOk("cancelled slot is free again", as(cust, (t) => t.query(
  `insert into public.bookings (customer_id, host_id, scheduled_at, duration_minutes, call_type) values ($1, $2, ${slot(11)}, 30, 'audio') returning id`, [cust, hostProfileId])), (r) => r.rows.length === 1);

console.log("\nBecome host");
await expectOk("customer becomes host via RPC", as(cust2, (t) => t.query(`select public.become_host() id`)), (r) => !!r.rows[0].id);
await expectOk("role switched to host", db.query(`select role from public.profiles where id=$1`, [cust2]), (r) => r.rows[0].role === "host");
await expectOk("unpublished host not in public_hosts", as("anon", (t) => t.query(`select count(*)::int c from public.public_hosts`)), (r) => r.rows[0].c === 1);
await expectErr("anon cannot call become_host", as("anon", (t) => t.query(`select public.become_host()`)), /permission denied/);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
