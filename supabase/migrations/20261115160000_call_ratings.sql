-- =====================================================================
-- HUMI · Rate the other person at the end of a call
--   * Guest → host: a normal public review (counts in the host's rating).
--   * Host → guest: a private rating, visible only to the host who wrote it and to admins.
-- Only real calls (ended, with billed time) can be rated, once each (it can be edited).
-- Safe to run more than once.
-- =====================================================================

-- Reviews can now come from a booking OR a call.
alter table public.reviews alter column booking_id drop not null;
alter table public.reviews add column if not exists call_id uuid unique references public.call_sessions (id) on delete cascade;
alter table public.reviews drop constraint if exists reviews_one_source;
alter table public.reviews add constraint reviews_one_source check ((booking_id is null) <> (call_id is null));

create or replace function public.reviews_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_booking public.bookings; v_call public.call_sessions;
begin
  if new.booking_id is not null then
    select * into v_booking from public.bookings where id = new.booking_id;
    if not found or v_booking.status <> 'completed' or v_booking.customer_id <> new.customer_id then
      raise exception 'You can only review your own completed sessions.' using errcode = '42501';
    end if;
    new.host_id := v_booking.host_id; -- never trust the client's host_id
  else
    select * into v_call from public.call_sessions where id = new.call_id;
    if not found or v_call.status <> 'ended' or v_call.billed_seconds <= 0 or v_call.customer_id <> new.customer_id then
      raise exception 'You can only review your own completed calls.' using errcode = '42501';
    end if;
    new.host_id := v_call.host_id;
  end if;
  return new;
end $$;

drop trigger if exists reviews_before_write on public.reviews;
create trigger reviews_before_write before insert or update of booking_id, call_id, customer_id, host_id on public.reviews
  for each row execute function public.reviews_before_write();

-- Host → guest ratings (private).
create table if not exists public.guest_ratings (
  id           uuid primary key default gen_random_uuid(),
  call_id      uuid not null unique references public.call_sessions (id) on delete cascade,
  host_id      uuid not null references public.host_profiles (id) on delete cascade,
  customer_id  uuid not null references public.profiles (id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  comment      text check (char_length(comment) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists guest_ratings_customer_idx on public.guest_ratings (customer_id);
alter table public.guest_ratings enable row level security;

drop policy if exists "guest_ratings: author or admin reads" on public.guest_ratings;
create policy "guest_ratings: author or admin reads" on public.guest_ratings for select to authenticated
  using (public.is_admin() or exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));
revoke all on public.guest_ratings from anon;
revoke insert, update, delete on public.guest_ratings from authenticated;

-- One entry point for both sides. Returns 'host' or 'guest' (who was rated).
create or replace function public.rate_call(p_call_id uuid, p_rating integer, p_comment text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_call public.call_sessions;
  v_host_user uuid;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then raise exception 'Please log in.' using errcode = '42501'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose 1 to 5 stars.' using errcode = 'P0001'; end if;
  if char_length(v_comment) > 1000 then raise exception 'Comment is too long.' using errcode = 'P0001'; end if;

  select * into v_call from public.call_sessions where id = p_call_id;
  if not found then raise exception 'Call not found.' using errcode = 'P0002'; end if;
  select user_id into v_host_user from public.host_profiles where id = v_call.host_id;

  if v_uid <> v_call.customer_id and v_uid is distinct from v_host_user then
    raise exception 'You were not in this call.' using errcode = '42501';
  end if;
  if v_call.status <> 'ended' or v_call.billed_seconds <= 0 then
    raise exception 'Only completed calls can be rated.' using errcode = 'P0001';
  end if;

  if v_uid = v_call.customer_id then
    insert into public.reviews (call_id, customer_id, host_id, rating, comment)
    values (p_call_id, v_uid, v_call.host_id, p_rating, v_comment)
    on conflict (call_id) do update set rating = excluded.rating, comment = excluded.comment;
    return 'host';
  end if;

  insert into public.guest_ratings (call_id, host_id, customer_id, rating, comment)
  values (p_call_id, v_call.host_id, v_call.customer_id, p_rating, v_comment)
  on conflict (call_id) do update set rating = excluded.rating, comment = excluded.comment, updated_at = now();
  return 'guest';
end $$;

-- Your own rating for a call (null if you haven't rated it yet).
create or replace function public.my_call_rating(p_call_id uuid)
returns table (rating smallint, comment text) language sql stable security definer set search_path = '' as $$
  select r.rating, r.comment from public.reviews r where r.call_id = p_call_id and r.customer_id = auth.uid()
  union all
  select g.rating, g.comment from public.guest_ratings g
  join public.host_profiles hp on hp.id = g.host_id
  where g.call_id = p_call_id and hp.user_id = auth.uid()
  limit 1;
$$;

revoke execute on function public.rate_call(uuid, integer, text), public.my_call_rating(uuid) from public, anon;
grant execute on function public.rate_call(uuid, integer, text), public.my_call_rating(uuid) to authenticated;

-- Make the API see the new functions right away.
notify pgrst, 'reload schema';
