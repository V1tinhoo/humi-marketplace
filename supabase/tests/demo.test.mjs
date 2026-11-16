// Demo hosts, private preview and simulated calls: 80/20 split, isolation from real money, permissions.
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
for (const f of files) await db.exec(readFileSync(f, "utf8"));
await db.exec(readFileSync(files.at(-1), "utf8")); // safe twice

const user = async (email, meta = { full_name: "X" }) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).id;
const boss = await user("boss@x.com", { full_name: "Boss" });
await db.query(`insert into public.platform_admins (user_id) values ($1)`, [boss]);
const tester = await user("tester@x.com", { full_name: "Tess" });
const joe = await user("joe@x.com", { full_name: "Joe" }); // ordinary customer

// A real host and a real paying customer, to prove nothing demo touches real data.
const realHostUser = await user("realhost@x.com", { full_name: "Rita", role: "host" });
const realHostId = (await one(`update public.host_profiles set is_published=true where user_id=$1 returning id`, [realHostUser])).id;
await as(realHostUser, `select public.set_host_pricing(100, null)`);
const t = (await as(joe, `select * from public.create_topup(5000,'mercadopago','pix')`, [])).rows[0];
await svc(`select * from public.confirm_topup($1,'mercadopago','p_x',5000,'approved','pix')`, [t.id]);
const realSnapshot = async () => one(`select
  (select coalesce(sum(balance_cents),0)::bigint from public.wallets) wallets,
  (select coalesce(sum(test_balance_cents),0)::bigint from public.wallets) test_wallets,
  (select count(*)::int from public.wallet_transactions) tx,
  (select count(*)::int from public.call_sessions) calls,
  (select coalesce(sum(amount_cents),0)::bigint from public.host_earnings) earnings,
  (select coalesce(sum(amount_cents),0)::bigint from public.platform_commissions) commissions,
  (select count(*)::int from public.reviews) reviews,
  (select count(*)::int from public.public_hosts) public_hosts`);
const before = await realSnapshot();

console.log("\nCommission: 20% everywhere");
check("commission setting is 20% (2000 bps)", Number((await one(`select value from public.platform_settings where key='commission_bps'`)).value) === 2000);
const split = async (total) => (await one(`select * from public.commission_split($1, 2000)`, [total]));
let sp = await split(1000);
check("R$ 10,00 → host R$ 8,00 / HUMI R$ 2,00", Number(sp.host_cents) === 800 && Number(sp.platform_cents) === 200, sp);
sp = await split(3000);
check("R$ 30,00 → host R$ 24,00 / HUMI R$ 6,00", Number(sp.host_cents) === 2400 && Number(sp.platform_cents) === 600, sp);
let sumsOk = true;
for (let c = 0; c <= 2000; c += 7) { const s = await split(c); if (Number(s.host_cents) + Number(s.platform_cents) !== c || Number(s.host_cents) !== Math.floor((c * 8000) / 10000)) sumsOk = false; }
check("host + HUMI always add up to the total (host rounded down, cents to HUMI)", sumsOk);
check("real host earnings now use 80% too (R$ 1,00 → R$ 0,80)", Number((await as(realHostUser, `select public.host_net_cents(100) n`)).rows[0].n) === 80);

console.log("\nWho can see the preview");
check("12 fictional hosts seeded", (await one(`select count(*)::int n from public.demo_hosts`)).n === 12);
check("every demo host is flagged is_demo", (await one(`select bool_and(is_demo) b from public.demo_hosts`)).b === true);
check("seeded simulated reviews update the demo rating", (await one(`select bool_and(review_count > 0 and rating_avg > 0) b from public.demo_hosts`)).b === true);
check("admin sees the preview hosts", (await as(boss, `select * from public.preview_hosts()`)).rows.length === 12);
check("an ordinary user can't open the preview", !(await attempt(as(joe, `select * from public.preview_hosts()`))).ok);
check("visitors can't either", !(await attempt(anon(`select * from public.preview_hosts()`))).ok);
check("ordinary users can't read demo tables directly", (await as(joe, `select * from public.demo_hosts`)).rows.length === 0 && (await as(joe, `select * from public.demo_reviews`)).rows.length === 0);
check("not even testers read the tables directly (only through the preview)", (await as(tester, `select * from public.demo_hosts`)).rows.length === 0);
check("non-admins can't add testers", !(await attempt(as(joe, `select public.admin_add_preview_tester('joe@x.com')`))).ok);
await as(boss, `select public.admin_add_preview_tester('TESTER@x.com')`);
check("admin adds a tester by e-mail", (await as(tester, `select * from public.preview_hosts()`)).rows.length === 12);
check("unknown e-mail is refused", !(await attempt(as(boss, `select public.admin_add_preview_tester('nobody@x.com')`))).ok);
const st = (await as(tester, `select * from public.preview_status()`)).rows[0];
check("tester status: allowed, sees commission 20% and a R$ 50 test balance", st.allowed && st.commission_bps === 2000 && Number(st.balance_cents) === 5000, st);
check("the public list never shows demo hosts", Number(before.public_hosts) === (await one(`select count(*)::int n from public.public_hosts`)).n && (await one(`select count(*)::int n from public.public_hosts where display_name in ('Emily','Mateo','Aiko')`)).n === 0);

console.log("\nAdmin manages demo hosts");
const created = await attempt(as(boss, `insert into public.demo_hosts (display_name, country, city, languages, categories, audio_cents_per_minute, video_cents_per_minute, sort_order) values ('Zara','Spain','Valencia',array['Spanish','English'],array['gaming'],100,150,0) returning id`));
check("admin creates a demo host", created.ok);
const zara = created.rows[0].id;
check("…edits it", (await attempt(as(boss, `update public.demo_hosts set bio='Hola!', audio_cents_per_minute=100 where id=$1`, [zara]))).ok && (await one(`select bio from public.demo_hosts where id=$1`, [zara])).bio === "Hola!");
check("…can't turn it into a real (non-demo) host", !(await attempt(as(boss, `update public.demo_hosts set is_demo=false where id=$1`, [zara]))).ok || (await one(`select is_demo from public.demo_hosts where id=$1`, [zara])).is_demo === true);
check("there's no 'verified' field to set on demo hosts", !(await attempt(as(boss, `update public.demo_hosts set is_verified=true where id=$1`, [zara]))).ok);
check("testers can't edit demo hosts", (await as(tester, `update public.demo_hosts set bio='hack' where id=$1 returning id`, [zara])).rows.length === 0);
check("testers can't add reviews", !(await attempt(as(tester, `insert into public.demo_reviews (demo_host_id, reviewer_name, rating) values ($1,'Me',5)`, [zara]))).ok);
await as(boss, `insert into public.demo_reviews (demo_host_id, reviewer_name, rating, comment) values ($1,'Ana',4,'Legal'),($1,'Bia',5,'Top')`, [zara]);
const z = await one(`select rating_avg, review_count from public.demo_hosts where id=$1`, [zara]);
check("simulated reviews give the demo rating (4.5, 2)", Number(z.rating_avg) === 4.5 && z.review_count === 2, z);
check("real reviews are untouched", Number(before.reviews) === (await one(`select count(*)::int n from public.reviews`)).n);
await as(boss, `insert into public.host_categories (slug, label_en, label_pt) values ('book-club','Book Club','Clube do livro')`);
check("admin creates a new category; everyone can read categories", (await anon(`select 1 from public.host_categories where slug='book-club'`)).rows.length === 1);
check("non-admins can't create categories", !(await attempt(as(joe, `insert into public.host_categories (slug, label_en, label_pt) values ('x-y','X','X')`))).ok);
await as(boss, `update public.demo_hosts set is_active=false where id=$1`, [zara]);
check("a deactivated host disappears from the preview", !(await as(tester, `select id from public.preview_hosts()`)).rows.some((r) => r.id === zara));
check("…but the admin can still open it ('view as client')", (await as(boss, `select * from public.preview_host($1)`, [zara])).rows.length === 1);
await as(boss, `update public.demo_hosts set is_active=true where id=$1`, [zara]);
await as(boss, `select public.admin_set_setting('demo_max_hosts', 5)`);
check("demo_max_hosts limits how many show (5)", (await as(tester, `select * from public.preview_hosts()`)).rows.length === 5);
await as(boss, `select public.admin_set_setting('demo_max_hosts', 24)`);
await as(boss, `select public.admin_set_setting('demo_enabled', 0)`);
check("global switch off: nobody sees demo hosts", !(await attempt(as(tester, `select * from public.preview_hosts()`))).ok);
await as(boss, `select public.admin_set_setting('demo_enabled', 1)`);

console.log("\nSimulated calls and the 80/20 split");
const emily = "00000000-0000-4000-8000-000000000001"; // R$ 0,90 audio / R$ 1,20 video
await as(boss, `update public.demo_hosts set audio_cents_per_minute=100 where id=$1`, [emily]); // R$ 1,00/min for the example
const start = (uid, host, type = "audio") => attempt(as(uid, `select * from public.demo_call_start($1,$2)`, [host, type]));
const tick = async (uid, id, on, extra = 0) => (await as(uid, `select * from public.demo_call_tick($1,$2,$3)`, [id, on, extra])).rows[0];
const end = async (uid, id, reason = "user_hangup") => (await as(uid, `select * from public.demo_call_end($1,$2)`, [id, reason])).rows[0];
const bal = async (uid) => Number((await as(uid, `select balance_cents from public.preview_status()`)).rows[0].balance_cents);

check("ordinary users can't start a simulated call", !(await start(joe, emily)).ok);
check("can't call a host type it doesn't offer (Lukas: audio only)", !(await start(tester, "00000000-0000-4000-8000-000000000006", "video")).ok);
await as(tester, `select public.demo_set_balance(10000)`); // R$ 100 test balance
let c = (await start(tester, emily)).rows[0];
check("call starts ringing at R$ 1,00/min with commission 20%", c.status === "ringing" && c.price_cents_per_minute === 100 && c.commission_bps === 2000, c);
check("only one test call at a time", !(await start(tester, emily)).ok);
c = await tick(tester, c.id, true);
check("connected", c.status === "connected");
c = await tick(tester, c.id, true, 600); // +10 min
check("after 10 min: R$ 10,00 charged, host R$ 8,00, HUMI R$ 2,00", Number(c.charged_cents) === 1000 && Number(c.host_cents) === 800 && Number(c.platform_cents) === 200, c);
c = await tick(tester, c.id, false);
check("connection drop → reconnecting", c.status === "reconnecting");
c = await tick(tester, c.id, false);
const midCharge = Number(c.charged_cents);
c = await tick(tester, c.id, true);
check("reconnect → connected, nothing billed while reconnecting", c.status === "connected" && Number(c.charged_cents) === midCharge, c);
c = await tick(tester, c.id, true, 1200); // +20 min → 30 min total
check("after 30 min: R$ 30,00 charged, host R$ 24,00, HUMI R$ 6,00", c.billed_seconds === 1800 && Number(c.charged_cents) === 3000 && Number(c.host_cents) === 2400 && Number(c.platform_cents) === 600, c);
c = await end(tester, c.id);
check("ended by the user", c.status === "ended" && c.end_reason === "user_hangup");
check("test balance went from R$ 100 to R$ 70", (await bal(tester)) === 7000);
const recs = await one(`select count(*)::int n, sum(amount_cents)::int a, sum(host_cents)::int h, sum(platform_cents)::int p from public.demo_billing_records where demo_session_id=$1`, [c.id]);
check("billing records add up to the session (3000 = 2400 + 600)", recs.a === 3000 && recs.h === 2400 && recs.p === 600, recs);

// Odd price: per-second billing, no rounding minutes up.
await as(boss, `update public.demo_hosts set audio_cents_per_minute=33 where id=$1`, [emily]);
c = (await start(tester, emily)).rows[0];
await tick(tester, c.id, true);
c = await tick(tester, c.id, true, 7); // 7 s at R$ 0,33/min = 3.85 → 3 cents
check("7 seconds at R$ 0,33/min = R$ 0,03 (per second, not a whole minute)", Number(c.charged_cents) === 3 && Number(c.host_cents) + Number(c.platform_cents) === 3, c);
c = await tick(tester, c.id, true, 53); // 60 s → 33
check("1 minute = R$ 0,33 → host R$ 0,26, HUMI R$ 0,07", Number(c.charged_cents) === 33 && Number(c.host_cents) === 26 && Number(c.platform_cents) === 7, c);
await end(tester, c.id);
await as(boss, `update public.demo_hosts set audio_cents_per_minute=100 where id=$1`, [emily]);

// Low / insufficient balance.
await as(tester, `select public.demo_set_balance(30)`); // R$ 0,30
const low = await start(tester, emily);
check("not enough test balance to start → refused", !low.ok && /test balance/.test(low.error), low);
await as(tester, `select public.demo_set_balance(150)`); // R$ 1,50
c = (await start(tester, emily)).rows[0];
await tick(tester, c.id, true);
c = await tick(tester, c.id, true, 120); // wants R$ 2,00, has R$ 1,50
check("balance runs out → call ends 'insufficient_funds', charged exactly the balance", c.status === "ended" && c.end_reason === "insufficient_funds" && Number(c.charged_cents) === 150, c);
check("test balance is 0, never negative", (await bal(tester)) === 0);
check("can't set a negative or absurd test balance", !(await attempt(as(tester, `select public.demo_set_balance(-1)`))).ok && !(await attempt(as(tester, `select public.demo_set_balance(99999999)`))).ok);
check("can't write the test wallet directly", !(await attempt(as(tester, `update public.demo_wallets set balance_cents=999999`))).ok || (await bal(tester)) === 0);
check("can't write call sessions directly", !(await attempt(as(tester, `update public.demo_call_sessions set charged_cents=0`))).ok);

// No answer.
await as(tester, `select public.demo_set_balance(5000)`);
c = (await start(tester, emily)).rows[0];
c = await end(tester, c.id, "no_answer");
check("hanging up while ringing = failed, nothing charged", c.status === "failed" && Number(c.charged_cents) === 0);

// Calls switch.
await as(boss, `select public.admin_set_setting('demo_calls_enabled', 0)`);
check("simulated calls switched off → can't start", !(await start(tester, emily)).ok);
await as(boss, `select public.admin_set_setting('demo_calls_enabled', 1)`);

console.log("\nHistory");
const mine = (await as(tester, `select * from public.demo_call_history()`)).rows;
check("tester sees their own test calls (4)", mine.length === 4, mine.length);
const bossOwn = await start(boss, emily);
await end(boss, bossOwn.rows[0].id, "cancelled");
check("p_all is ignored for non-admins", (await as(tester, `select * from public.demo_call_history(p_all => true)`)).rows.length === 4);
check("admin sees everyone's with p_all (5)", (await as(boss, `select * from public.demo_call_history(p_all => true)`)).rows.length === 5);
check("filter by type (video: 0)", (await as(boss, `select * from public.demo_call_history(p_type => 'video', p_all => true)`)).rows.length === 0);
check("filter by host", (await as(boss, `select * from public.demo_call_history(p_host => $1, p_all => true)`, [emily])).rows.length === 5);
check("ordinary users can't read history", !(await attempt(as(joe, `select * from public.demo_call_history()`))).ok);

console.log("\nReal money untouched");
const after = await realSnapshot();
check("real & test wallets, transactions, calls, host earnings, commissions and public hosts unchanged", JSON.stringify(before) === JSON.stringify(after), { before, after });
const ov = (await as(boss, `select * from public.admin_overview()`)).rows[0];
check("admin revenue figures don't include simulated calls", Number(ov.admin_overview?.revenue_cents ?? ov.revenue_cents ?? 0) === 0, ov);

console.log("\nDeleting");
check("admin deletes a demo host (its reviews go too; call history keeps the name)", (await attempt(as(boss, `delete from public.demo_hosts where id=$1`, [zara]))).ok && (await one(`select count(*)::int n from public.demo_reviews where demo_host_id=$1`, [zara])).n === 0);
await as(boss, `select public.admin_remove_preview_tester($1)`, [tester]);
check("removed tester loses access", !(await attempt(as(tester, `select * from public.preview_hosts()`))).ok);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
