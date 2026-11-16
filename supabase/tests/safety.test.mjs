// Safety: blocking, automatic suspension after reports, limit on declined calls, call rules.
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

const user = async (email, meta) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1,$2) returning id`, [email, meta])).id;
const newHost = async (email, name) => {
  const u = await user(email, { full_name: name, role: "host" });
  const id = (await one(`update public.host_profiles set is_published=true where user_id=$1 returning id`, [u])).id;
  await as(u, `select public.set_host_pricing(100, null)`);
  await db.query(`insert into public.host_availability (host_id, day_of_week, start_time, end_time, timezone) select $1, d, '00:00', '24:00', 'UTC' from generate_series(0,6) d`, [id]);
  return { u, id };
};
const pay = async (uid, cents) => {
  const t = (await as(uid, `select * from public.create_topup($1,$2,'pix')`, [cents, "mercadopago"])).rows[0];
  await svc(`select * from public.confirm_topup($1,$2,$3,$4,'approved','pix')`, [t.id, "mercadopago", "p_" + t.id.slice(0, 8), cents]);
};
const start = (uid, hostId) => attempt(as(uid, `select * from public.start_call($1,'audio')`, [hostId]));
const finish = (id, reason) => svc(`select public.finish_call($1,$2)`, [id, reason]);
const visible = async (uid, hostId) => (await (uid ? as(uid, `select 1 from public.public_hosts where id=$1`, [hostId]) : anon(`select 1 from public.public_hosts where id=$1`, [hostId]))).rows.length === 1;
const book = (uid, hostId) => attempt(as(uid, `insert into public.bookings (customer_id, host_id, scheduled_at, duration_minutes, call_type) values ($1,$2, date_trunc('hour', now()) + interval '2 days', 30, 'audio') returning id`, [uid, hostId]));

const hana = await newHost("hana@x.com", "Hana");
const ana = await user("ana@x.com", { full_name: "Ana Souza" });
const bia = await user("bia@x.com", { full_name: "Bia" });
await pay(ana, 5000);
await pay(bia, 5000);

console.log("\nBlocking");
const c1 = (await start(ana, hana.id)).rows[0];
await finish(c1.id, "customer_hangup");
const bk = (await book(ana, hana.id)).rows[0];
check("Ana can book Hana before any block", !!bk?.id);
check("Bia can't block Ana through a call she wasn't in", !(await attempt(as(bia, `select public.block_user(p_call_id => $1)`, [c1.id]))).ok);
check("Hana blocks Ana from their call", (await attempt(as(hana.u, `select public.block_user(p_call_id => $1)`, [c1.id]))).ok);
check("…twice is fine", (await attempt(as(hana.u, `select public.block_user(p_call_id => $1)`, [c1.id]))).ok);
const r = await start(ana, hana.id);
check("Ana can't call Hana any more (looks like 'not available')", !r.ok && /not available/.test(r.error), r);
check("Ana can't book Hana", !(await book(ana, hana.id)).ok);
check("Ana's upcoming booking with Hana was cancelled", (await one(`select status from public.bookings where id=$1`, [bk.id])).status === "cancelled");
check("Ana no longer sees Hana in the list", !(await visible(ana, hana.id)));
check("Bia and visitors still see Hana", (await visible(bia, hana.id)) && (await visible(null, hana.id)));
check("Bia can still call Hana", (await start(bia, hana.id)).ok);
await svc(`update public.call_sessions set status='ended', end_reason='customer_hangup', ended_at=now() where customer_id=$1 and status in ('ringing','connected')`, [bia]);
const blocks = (await as(hana.u, `select * from public.my_blocks()`)).rows;
check("Hana sees Ana in her blocked list (first name only)", blocks.length === 1 && blocks[0].name === "Ana", blocks);
check("Ana can't see Hana's blocks", (await as(ana, `select * from public.user_blocks`)).rows.length === 0);
check("nobody can insert blocks directly", !(await attempt(as(ana, `insert into public.user_blocks (blocker_id, blocked_id) values ($1,$2)`, [ana, bia]))).ok);
await as(hana.u, `select public.unblock_user($1)`, [ana]);
check("after unblocking, Ana can call again", (await start(ana, hana.id)).ok);
await svc(`update public.call_sessions set status='ended', end_reason='customer_hangup', ended_at=now() where customer_id=$1 and status in ('ringing','connected')`, [ana]);
check("a customer can block a host from the profile", (await attempt(as(bia, `select public.block_user(p_host_id => $1)`, [hana.id]))).ok && !(await visible(bia, hana.id)));
check("you can't block yourself", !(await attempt(as(hana.u, `select public.block_user(p_host_id => $1)`, [hana.id]))).ok);
await as(bia, `select public.unblock_user($1)`, [hana.u]);

console.log("\nDeclined calls limit");
const kai = await newHost("kai@x.com", "Kai");
const cara = await user("cara@x.com", { full_name: "Cara" });
await pay(cara, 5000);
for (let i = 0; i < 3; i++) {
  const c = (await start(cara, kai.id)).rows[0];
  await finish(c.id, "declined");
}
const r4 = await start(cara, kai.id);
check("after 3 declined calls in a row, Cara must wait", !r4.ok && /try again later/.test(r4.error), r4);
check("she can still call other hosts", (await start(cara, hana.id)).ok);
await svc(`update public.call_sessions set status='ended', end_reason='customer_hangup', ended_at=now() where customer_id=$1 and status in ('ringing','connected')`, [cara]);
await db.query(`update public.call_sessions set created_at = created_at - interval '25 hours' where customer_id=$1 and host_id=$2`, [cara, kai.id]);
check("after 24 h she can call Kai again", (await start(cara, kai.id)).ok);
await svc(`update public.call_sessions set status='ended', end_reason='customer_hangup', ended_at=now() where customer_id=$1 and status in ('ringing','connected')`, [cara]);
const dan = await user("dan@x.com", { full_name: "Dan" });
await pay(dan, 5000);
for (const reason of ["declined", "customer_hangup", "declined"]) await finish((await start(dan, kai.id)).rows[0].id, reason);
check("not blocked when the refusals aren't in a row", (await start(dan, kai.id)).ok);
await svc(`update public.call_sessions set status='ended', end_reason='customer_hangup', ended_at=now() where customer_id=$1 and status in ('ringing','connected')`, [dan]);

console.log("\nAutomatic suspension");
const rex = await user("rex@x.com", { full_name: "Rex" }); // the troublemaker (a customer)
await pay(rex, 20000);
const hosts = [hana, kai, await newHost("lia@x.com", "Lia")];
const callWith = async (h) => { const c = (await start(rex, h.id)).rows[0]; await finish(c.id, "customer_hangup"); return c.id; };
const report = (reporter, callId) => as(reporter, `select public.report_user('harassment', null, $1)`, [callId]);
const suspended = async (uid) => (await one(`select suspended_at from public.profiles where id=$1`, [uid])).suspended_at !== null;
const c_h = await callWith(hana);
await report(hana.u, c_h);
await report(hana.u, await callWith(hana)); // same person twice
check("2 reports from the same person don't suspend", !(await suspended(rex)));
await report(kai.u, await callWith(kai));
check("2 different people: not yet", !(await suspended(rex)));
await report(hosts[2].u, await callWith(hosts[2]));
check("3 different people after real calls: suspended", await suspended(rex));
check("login blocked too (banned_until set)", (await one(`select banned_until > now() b from auth.users where id=$1`, [rex])).b === true);
const rs = await start(rex, hana.id);
check("a suspended account can't start calls", !rs.ok && /suspended/.test(rs.error), rs);
check("the suspension is logged for the admin", (await one(`select count(*)::int n from public.admin_actions where action='auto_suspend' and target=$1`, [rex])).n === 1);
check("users can't lift their own suspension", !(await attempt(as(rex, `update public.profiles set suspended_at=null where id=$1`, [rex]))).ok || (await suspended(rex)));

// A suspended host disappears from the list.
const mia = await newHost("mia@x.com", "Mia");
for (const cust of [ana, bia, cara]) {
  const c = (await start(cust, mia.id)).rows[0];
  await finish(c.id, "customer_hangup");
  await as(cust, `select public.report_user('sexual_content', null, $1)`, [c.id]);
}
check("a host reported by 3 customers is suspended and hidden", (await suspended(mia.u)) && !(await visible(null, mia.id)));
// Reports from a profile page (no real conversation) don't count towards suspension.
const zoe = await newHost("zoe@x.com", "Zoe");
for (const name of ["v1", "v2", "v3"]) {
  const v = await user(`${name}@x.com`, { full_name: name });
  await as(v, `select public.report_user('spam_or_scam', null, null, null, $1)`, [zoe.id]);
}
check("3 profile-only reports don't suspend (fake accounts can't take a host down)", !(await suspended(zoe.u)));

const boss = await user("boss@x.com", { full_name: "Boss" });
await db.query(`insert into public.platform_admins (user_id) values ($1)`, [boss]);
check("non-admins can't clear a suspension", !(await attempt(as(ana, `select public.admin_clear_suspension($1)`, [rex]))).ok);
await as(boss, `select public.admin_clear_suspension($1)`, [rex]);
check("admin clears the suspension", !(await suspended(rex)));
check("admin can change the thresholds", (await attempt(as(boss, `select public.admin_set_setting('auto_suspend_reports', 5)`))).ok);
check("…within limits", !(await attempt(as(boss, `select public.admin_set_setting('declined_call_limit', 500)`))).ok);

console.log("\nCommunity rules");
check("not accepted yet", (await as(dan, `select public.call_rules_accepted() a`)).rows[0].a === false);
await as(dan, `select public.accept_call_rules()`);
const first = (await one(`select call_rules_accepted_at t from public.profiles where id=$1`, [dan])).t;
await as(dan, `select public.accept_call_rules()`);
check("accepted, and the first date is kept", (await as(dan, `select public.call_rules_accepted() a`)).rows[0].a === true && +(await one(`select call_rules_accepted_at t from public.profiles where id=$1`, [dan])).t === +first);
check("visitors can't call these", !(await attempt(anon(`select public.my_blocks()`))).ok);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
