// Checks the avatar storage policies against a minimal stand-in for Supabase's storage schema.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const [migration] = process.argv.slice(2);
const db = new PGlite();
let fail = 0;
const check = (name, cond, info) => { console.log(cond ? "  PASS" : "  FAIL", name, cond ? "" : (info ?? "")); if (!cond) fail++; };
const as = (uid, fn) => db.transaction(async (t) => {
  if (uid === "anon") await t.exec(`set local role anon; select set_config('request.jwt.claim.sub', '', true);`);
  else await t.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`);
  return fn(t);
});
const tryq = async (uid, sql, params = []) => { try { const r = await as(uid, (t) => t.query(sql, params)); return { ok: true, rows: r.rows, affected: r.affectedRows }; } catch (e) { return { ok: false, error: e.message }; } };

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema storage;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null, owner uuid default auth.uid());
  -- same behaviour as Supabase's storage.foldername(): folder segments of the object path
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage, auth to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
  grant select on storage.buckets to anon, authenticated;
  grant execute on all functions in schema storage, auth to anon, authenticated;
`);

const a = "11111111-1111-1111-1111-111111111111";
const b = "22222222-2222-2222-2222-222222222222";

await db.exec(readFileSync(migration, "utf8"));
await db.exec(readFileSync(migration, "utf8")); // idempotent
const bucket = (await db.query(`select * from storage.buckets where id='avatars'`)).rows[0];
check("bucket created, public, 5 MB, images only", bucket?.public === true && Number(bucket.file_size_limit) === 5242880 && bucket.allowed_mime_types.join() === "image/jpeg,image/png,image/webp");

check("user uploads into own folder", (await tryq(a, `insert into storage.objects (bucket_id, name) values ('avatars', '${a}/avatar-1.jpg')`)).ok);
const other = await tryq(a, `insert into storage.objects (bucket_id, name) values ('avatars', '${b}/evil.jpg')`);
check("user cannot upload into someone else's folder", !other.ok && /row-level security/.test(other.error), other.error);
const root = await tryq(a, `insert into storage.objects (bucket_id, name) values ('avatars', 'evil.jpg')`);
check("user cannot upload to the bucket root", !root.ok, root.error);
const anonUp = await tryq("anon", `insert into storage.objects (bucket_id, name) values ('avatars', '${a}/x.jpg')`);
check("anon cannot upload", !anonUp.ok, anonUp.error);
await db.query(`insert into storage.objects (bucket_id, name, owner) values ('avatars', '${b}/photo.jpg', '${b}')`);
const delOther = await tryq(a, `delete from storage.objects where name='${b}/photo.jpg'`);
check("user cannot delete someone else's photo", delOther.ok && delOther.affected === 0);
const updOther = await tryq(a, `update storage.objects set name='${a}/stolen.jpg' where name='${b}/photo.jpg'`);
check("user cannot move someone else's photo", updOther.ok && updOther.affected === 0);
const delOwn = await tryq(a, `delete from storage.objects where name='${a}/avatar-1.jpg'`);
check("user can delete own photo", delOwn.ok && delOwn.affected === 1);
const listOwn = await tryq(b, `select name from storage.objects where bucket_id='avatars'`);
check("user lists only own files", listOwn.ok && listOwn.rows.length === 1 && listOwn.rows[0].name.startsWith(b));

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
