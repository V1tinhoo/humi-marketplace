-- =====================================================================
-- HUMI — profile photo uploads (Supabase Storage)
-- Public bucket "avatars": anyone can view photos by URL; each signed-in
-- user can only write inside their own folder:  avatars/<user id>/<file>
-- Safe to run more than once.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars: owner can read own folder" on storage.objects;
drop policy if exists "avatars: owner can upload" on storage.objects;
drop policy if exists "avatars: owner can update" on storage.objects;
drop policy if exists "avatars: owner can delete" on storage.objects;

-- Public URLs work without a policy (public bucket); this only allows listing your own files.
create policy "avatars: owner can read own folder" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: owner can upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: owner can update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: owner can delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
