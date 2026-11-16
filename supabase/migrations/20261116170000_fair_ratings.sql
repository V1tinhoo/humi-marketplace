-- =====================================================================
-- HUMI · Fair ratings
--   1. One person counts once: if someone rated the same host several times
--      (one review per call), only their most recent review counts in the
--      host's average and review count, and only that one is shown publicly.
--      The older ones are kept, just not counted.
--   2. Only calls of at least 1 minute (billed) can be rated — both ways.
--      Older reviews of shorter calls stop counting too.
-- Bookings reviews (no call) keep counting as before.
-- Safe to run more than once.
-- =====================================================================

create or replace function public.review_min_seconds()
returns integer language sql immutable as $$ select 60 $$;

/** The reviews that count: eligible ones, the latest per person per host. */
create or replace view public.counted_reviews as
select distinct on (r.host_id, r.customer_id) r.*
from public.reviews r
left join public.call_sessions cs on cs.id = r.call_id
where r.call_id is null or cs.billed_seconds >= public.review_min_seconds()
order by r.host_id, r.customer_id, r.created_at desc, r.id desc;

revoke all on public.counted_reviews from anon, authenticated;

create or replace function public.refresh_host_rating()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_host uuid := coalesce(new.host_id, old.host_id);
begin
  update public.host_profiles hp set
    average_rating = coalesce((select round(avg(r.rating)::numeric, 2) from public.counted_reviews r where r.host_id = v_host), 0),
    review_count   = (select count(*) from public.counted_reviews r where r.host_id = v_host)
  where hp.id = v_host;
  return null;
end $$;

-- Public list: the same reviews that count (one per person).
create or replace view public.public_reviews as
select r.id, r.host_id, r.rating, r.comment, r.created_at,
       split_part(p.full_name, ' ', 1) as author_name,
       p.country as author_country
from public.counted_reviews r
join public.profiles p on p.id = r.customer_id
join public.host_profiles hp on hp.id = r.host_id
where hp.is_published;
grant select on public.public_reviews to anon, authenticated;

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
    if v_call.billed_seconds < public.review_min_seconds() then
      raise exception 'Only calls of at least 1 minute can be rated.' using errcode = 'P0001', hint = 'too_short';
    end if;
    new.host_id := v_call.host_id;
  end if;
  return new;
end $$;

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
  if v_call.billed_seconds < public.review_min_seconds() then
    raise exception 'Only calls of at least 1 minute can be rated.' using errcode = 'P0001', hint = 'too_short';
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

-- Recalculate every host with the new rules.
update public.host_profiles hp set
  average_rating = coalesce((select round(avg(r.rating)::numeric, 2) from public.counted_reviews r where r.host_id = hp.id), 0),
  review_count   = (select count(*) from public.counted_reviews r where r.host_id = hp.id);

notify pgrst, 'reload schema';
