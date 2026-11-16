-- HUMI · full database setup for a NEW Supabase project.
-- Run once in Supabase → SQL Editor (all migrations, in order).

-- ===================== 20261114120000_humi_initial_schema.sql =====================
-- =====================================================================
-- HUMI — initial schema
-- Tables, constraints, indexes, triggers, server-side pricing,
-- Row Level Security, public views and booking RPCs.
--
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- Safe defaults: nothing is publicly readable except the whitelisted
-- columns exposed through the public_* views.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.user_role as enum ('customer', 'host', 'admin');
create type public.booking_status as enum ('pending', 'confirmed', 'completed', 'cancelled');
create type public.call_type as enum ('audio', 'video');
-- 'demo' = recorded without any real charge (no payment provider connected yet)
create type public.payment_status as enum ('demo', 'pending', 'succeeded', 'failed', 'refunded');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 80),
  username    text unique check (username ~ '^[a-z0-9_]{3,30}$'),
  avatar_url  text check (avatar_url is null or avatar_url ~ '^https://'),
  bio         text check (char_length(bio) <= 1000),
  country     text check (char_length(country) <= 60),
  city        text check (char_length(city) <= 60),
  languages   text[] not null default '{}' check (cardinality(languages) <= 10),
  interests   text[] not null default '{}' check (cardinality(interests) <= 20),
  role        public.user_role not null default 'customer',
  is_sample   boolean not null default false, -- fictional demo profile created by the seed script
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'One row per auth user. Private: readable only by its owner (and admins). Public host fields are exposed via public_hosts.';

create table public.host_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references public.profiles (id) on delete cascade,
  display_name    text not null check (char_length(display_name) between 1 and 40),
  tagline         text check (char_length(tagline) <= 140),
  description     text check (char_length(description) <= 2000),
  experience      text check (char_length(experience) <= 1000),
  -- Price in USD for a 30-minute audio session; platform limits enforced here.
  session_price   numeric(10, 2) not null default 5 check (session_price between 3 and 30),
  hourly_rate     numeric(10, 2) generated always as (round(session_price * 2, 2)) stored,
  categories      text[] not null default '{}' check (categories <@ array['talk', 'play', 'cultures', 'meet']::text[]),
  call_types      public.call_type[] not null default array['audio', 'video']::public.call_type[] check (cardinality(call_types) >= 1),
  timezone        text not null default 'UTC', -- IANA name, e.g. America/Sao_Paulo
  is_available    boolean not null default false, -- "online now"
  is_published    boolean not null default false, -- listed in the marketplace
  is_verified     boolean not null default false, -- set only by admins / verification provider
  average_rating  numeric(3, 2) not null default 0 check (average_rating between 0 and 5),
  review_count    integer not null default 0 check (review_count >= 0),
  total_sessions  integer not null default 0 check (total_sessions >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.host_availability (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null references public.host_profiles (id) on delete cascade,
  day_of_week  smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday … 6 = Saturday (same as JS getDay)
  start_time   time not null,
  end_time     time not null, -- may be 24:00
  timezone     text not null default 'UTC',
  created_at   timestamptz not null default now(),
  constraint host_availability_window check (end_time > start_time)
);

create table public.bookings (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.profiles (id) on delete restrict,
  host_id           uuid not null references public.host_profiles (id) on delete restrict,
  scheduled_at      timestamptz not null,
  ends_at           timestamptz not null,           -- set by trigger
  duration_minutes  smallint not null check (duration_minutes in (20, 30, 60)),
  call_type         public.call_type not null,
  -- All amounts below are computed by the database (bookings_before_insert); client values are ignored.
  subtotal          numeric(10, 2) not null default 0 check (subtotal >= 0),
  total_price       numeric(10, 2) not null default 0 check (total_price >= 0),
  platform_fee      numeric(10, 2) not null default 0 check (platform_fee >= 0),
  host_earnings     numeric(10, 2) not null default 0 check (host_earnings >= 0),
  currency          text not null default 'USD',
  status            public.booking_status not null default 'pending',
  cancelled_by      uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint bookings_amounts_consistent check (total_price = host_earnings + platform_fee),
  constraint bookings_time_order check (ends_at > scheduled_at),
  -- A host can never have two active bookings that overlap.
  constraint bookings_no_overlap exclude using gist (
    host_id with =,
    tstzrange(scheduled_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'))
);

create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null unique references public.bookings (id) on delete cascade,
  customer_id  uuid not null references public.profiles (id) on delete cascade,
  host_id      uuid not null references public.host_profiles (id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  comment      text check (char_length(comment) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  booking_id           uuid not null references public.bookings (id) on delete restrict,
  customer_id          uuid not null references public.profiles (id) on delete restrict,
  amount               numeric(10, 2) not null check (amount >= 0),
  currency             text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  payment_provider     text not null default 'demo',
  provider_payment_id  text,
  status               public.payment_status not null default 'demo',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint payments_provider_id_unique unique (payment_provider, provider_payment_id)
);

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
create index host_profiles_published_idx on public.host_profiles (is_published, average_rating desc) where is_published;
create index host_profiles_categories_idx on public.host_profiles using gin (categories);
create index profiles_languages_idx on public.profiles using gin (languages);
create index profiles_interests_idx on public.profiles using gin (interests);
create index host_availability_host_idx on public.host_availability (host_id, day_of_week);
create index bookings_customer_idx on public.bookings (customer_id, scheduled_at desc);
create index bookings_host_idx on public.bookings (host_id, scheduled_at desc);
create index reviews_host_idx on public.reviews (host_id, created_at desc);
create index reviews_customer_idx on public.reviews (customer_id);
create index payments_booking_idx on public.payments (booking_id);
create index payments_customer_idx on public.payments (customer_id);

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger host_profiles_updated_at before update on public.host_profiles for each row execute function public.set_updated_at();
create trigger bookings_updated_at before update on public.bookings for each row execute function public.set_updated_at();
create trigger reviews_updated_at before update on public.reviews for each row execute function public.set_updated_at();
create trigger payments_updated_at before update on public.payments for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Rejects unknown time zone names (e.g. typos) on write.
create or replace function public.validate_timezone()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform now() at time zone new.timezone;
  return new;
exception when others then
  raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
end $$;

create trigger host_profiles_timezone before insert or update of timezone on public.host_profiles for each row execute function public.validate_timezone();
create trigger host_availability_timezone before insert or update of timezone on public.host_availability for each row execute function public.validate_timezone();

-- ---------------------------------------------------------------------
-- Pricing (single source of truth — mirrored for display in src/lib/utils.ts)
--   subtotal      = (session_price + $1 if video) × duration multiplier
--   service_fee   = 10% of subtotal, paid by the customer on top
--   commission    = 10% of subtotal, kept by HUMI
--   total_price   = subtotal + service_fee
--   platform_fee  = service_fee + commission
--   host_earnings = subtotal − commission
-- ---------------------------------------------------------------------
create or replace function public.humi_price_quote(p_session_price numeric, p_duration integer, p_call_type public.call_type)
returns table (subtotal numeric, service_fee numeric, total_price numeric, platform_fee numeric, host_earnings numeric)
language plpgsql immutable set search_path = '' as $$
declare
  v_base numeric := p_session_price + case when p_call_type = 'video' then 1 else 0 end;
  v_mult numeric := case p_duration when 20 then 0.75 when 30 then 1 when 60 then 1.85 end;
  v_commission numeric;
begin
  if v_mult is null then
    raise exception 'Unsupported duration: %', p_duration using errcode = '22023';
  end if;
  subtotal      := round(v_base * v_mult, 2);
  service_fee   := round(subtotal * 0.10, 2);
  v_commission  := round(subtotal * 0.10, 2);
  total_price   := subtotal + service_fee;
  platform_fee  := service_fee + v_commission;
  host_earnings := subtotal - v_commission;
  return next;
end $$;

-- ---------------------------------------------------------------------
-- New users → profile (+ host profile when signing up as host)
-- Role comes from sign-up metadata but can never be 'admin'.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := case when new.raw_user_meta_data ->> 'role' = 'host' then 'host' else 'customer' end;
  v_name text := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)), 80);
begin
  insert into public.profiles (id, full_name, role) values (new.id, v_name, v_role);
  if v_role = 'host' then
    insert into public.host_profiles (user_id, display_name)
    values (new.id, left(coalesce(nullif(split_part(v_name, ' ', 1), ''), 'Host'), 40));
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Lets an existing customer become a host (role can't be changed directly).
create or replace function public.become_host()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  update public.profiles set role = 'host' where id = v_uid and role = 'customer';
  insert into public.host_profiles (user_id, display_name)
  select p.id, left(coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'Host'), 40) from public.profiles p where p.id = v_uid
  on conflict (user_id) do nothing;
  select id into v_id from public.host_profiles where user_id = v_uid;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Bookings: server-side validation and pricing
-- ---------------------------------------------------------------------
create or replace function public.bookings_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_host public.host_profiles;
  v_quote record;
  v_uid uuid := auth.uid();
begin
  -- Signed-in callers can only book for themselves (service role / SQL editor have no uid).
  if v_uid is not null and new.customer_id is distinct from v_uid then
    raise exception 'You can only book sessions for yourself.' using errcode = '42501';
  end if;

  select * into v_host from public.host_profiles where id = new.host_id;
  if not found or not v_host.is_published then
    raise exception 'This host is not accepting bookings.' using errcode = 'P0001', hint = 'host_unavailable';
  end if;
  if v_host.user_id = new.customer_id then
    raise exception 'You can''t book a session with yourself.' using errcode = 'P0001', hint = 'self_booking';
  end if;
  if not (new.call_type = any (v_host.call_types)) then
    raise exception 'This host doesn''t offer % sessions.', new.call_type using errcode = 'P0001', hint = 'call_type_unavailable';
  end if;
  if new.scheduled_at < now() + interval '30 minutes' then
    raise exception 'Sessions must be booked at least 30 minutes in advance.' using errcode = 'P0001', hint = 'too_soon';
  end if;
  if new.scheduled_at > now() + interval '60 days' then
    raise exception 'Sessions can be booked up to 60 days ahead.' using errcode = 'P0001', hint = 'too_far';
  end if;

  -- The whole session must fit inside one of the host's weekly windows (in the window's own time zone).
  if not exists (
    select 1
    from public.host_availability a
    cross join lateral (select (new.scheduled_at at time zone a.timezone) as local_start) l
    where a.host_id = new.host_id
      and extract(dow from l.local_start) = a.day_of_week
      and l.local_start::time >= a.start_time
      and (l.local_start::time - time '00:00') + make_interval(mins => new.duration_minutes) <= (a.end_time - time '00:00')
  ) then
    raise exception 'That time is outside the host''s availability.' using errcode = 'P0001', hint = 'outside_availability';
  end if;

  select * into v_quote from public.humi_price_quote(v_host.session_price, new.duration_minutes, new.call_type);

  new.ends_at       := new.scheduled_at + make_interval(mins => new.duration_minutes);
  new.subtotal      := v_quote.subtotal;
  new.total_price   := v_quote.total_price;
  new.platform_fee  := v_quote.platform_fee;
  new.host_earnings := v_quote.host_earnings;
  new.currency      := 'USD';
  new.status        := 'pending';
  new.cancelled_by  := null;
  new.created_at    := now();
  new.updated_at    := now();
  return new;
end $$;

create trigger bookings_before_insert before insert on public.bookings for each row execute function public.bookings_before_insert();

-- Every booking gets a payment record. While no provider is connected it is a
-- 'demo' record: no money moves and the UI says so.
create or replace function public.bookings_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.payments (booking_id, customer_id, amount, currency, payment_provider, status)
  values (new.id, new.customer_id, new.total_price, new.currency, 'demo', 'demo');
  return new;
end $$;

create trigger bookings_after_insert after insert on public.bookings for each row execute function public.bookings_after_insert();

create or replace function public.bookings_after_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    update public.host_profiles set total_sessions = total_sessions + 1 where id = new.host_id;
  end if;
  return new;
end $$;

create trigger bookings_status_change after update of status on public.bookings for each row execute function public.bookings_after_status_change();

-- Status transitions go through these functions only (clients have no UPDATE on bookings).
create or replace function public.confirm_booking(p_booking_id uuid)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare v public.bookings;
begin
  update public.bookings b set status = 'confirmed'
  where b.id = p_booking_id and b.status = 'pending' and b.scheduled_at > now()
    and exists (select 1 from public.host_profiles hp where hp.id = b.host_id and hp.user_id = auth.uid())
  returning * into v;
  if not found then raise exception 'Booking can''t be confirmed.' using errcode = 'P0001', hint = 'invalid_transition'; end if;
  return v;
end $$;

create or replace function public.complete_booking(p_booking_id uuid)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare v public.bookings;
begin
  update public.bookings b set status = 'completed'
  where b.id = p_booking_id and b.status = 'confirmed' and b.ends_at <= now()
    and (public.is_admin() or exists (select 1 from public.host_profiles hp where hp.id = b.host_id and hp.user_id = auth.uid()))
  returning * into v;
  if not found then raise exception 'Booking can''t be completed yet.' using errcode = 'P0001', hint = 'invalid_transition'; end if;
  return v;
end $$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings language plpgsql security definer set search_path = '' as $$
declare v public.bookings;
begin
  update public.bookings b set status = 'cancelled', cancelled_by = auth.uid()
  where b.id = p_booking_id and b.status in ('pending', 'confirmed') and b.scheduled_at > now()
    and (b.customer_id = auth.uid() or exists (select 1 from public.host_profiles hp where hp.id = b.host_id and hp.user_id = auth.uid()))
  returning * into v;
  if not found then raise exception 'Booking can''t be cancelled.' using errcode = 'P0001', hint = 'invalid_transition'; end if;
  -- Demo payments stay 'demo'; a real provider integration would issue refunds here (server-side).
  return v;
end $$;

-- Busy time ranges for a host, without any customer details (for the slot picker).
create or replace function public.get_host_busy_slots(p_host_id uuid, p_from timestamptz, p_to timestamptz)
returns table (scheduled_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.scheduled_at, b.ends_at
  from public.bookings b
  where b.host_id = p_host_id
    and b.status in ('pending', 'confirmed')
    and b.scheduled_at < least(p_to, p_from + interval '62 days')
    and b.ends_at > p_from
  order by b.scheduled_at;
$$;

-- ---------------------------------------------------------------------
-- Reviews: only for your own completed bookings; keep host aggregates fresh
-- ---------------------------------------------------------------------
create or replace function public.reviews_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = new.booking_id;
  if not found or v_booking.status <> 'completed' or v_booking.customer_id <> new.customer_id then
    raise exception 'You can only review your own completed sessions.' using errcode = '42501';
  end if;
  new.host_id := v_booking.host_id; -- never trust the client's host_id
  return new;
end $$;

create trigger reviews_before_write before insert or update of booking_id, customer_id, host_id on public.reviews for each row execute function public.reviews_before_write();

create or replace function public.refresh_host_rating()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_host uuid := coalesce(new.host_id, old.host_id);
begin
  update public.host_profiles hp set
    average_rating = coalesce((select round(avg(r.rating)::numeric, 2) from public.reviews r where r.host_id = v_host), 0),
    review_count   = (select count(*) from public.reviews r where r.host_id = v_host)
  where hp.id = v_host;
  return null;
end $$;

create trigger reviews_refresh_rating after insert or update or delete on public.reviews for each row execute function public.refresh_host_rating();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.host_profiles     enable row level security;
alter table public.host_availability enable row level security;
alter table public.bookings          enable row level security;
alter table public.reviews           enable row level security;
alter table public.payments          enable row level security;

-- profiles: own row only
create policy "profiles: read own" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles: update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- host_profiles: owner reads/updates; everyone else uses public_hosts
create policy "host_profiles: read own" on public.host_profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "host_profiles: update own" on public.host_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- host_availability: owner manages
create policy "availability: read own" on public.host_availability for select to authenticated
  using (public.is_admin() or exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));
create policy "availability: insert own" on public.host_availability for insert to authenticated
  with check (exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));
create policy "availability: update own" on public.host_availability for update to authenticated
  using (exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()))
  with check (exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));
create policy "availability: delete own" on public.host_availability for delete to authenticated
  using (exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));

-- bookings: customers create for themselves; customer + host can read
create policy "bookings: customer creates own" on public.bookings for insert to authenticated with check (customer_id = auth.uid());
create policy "bookings: participants read" on public.bookings for select to authenticated
  using (customer_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));

-- reviews: customer of a completed booking creates; participants read (public via public_reviews)
create policy "reviews: customer creates for completed booking" on public.reviews for insert to authenticated
  with check (
    customer_id = auth.uid()
    and exists (select 1 from public.bookings b where b.id = booking_id and b.customer_id = auth.uid() and b.status = 'completed')
  );
create policy "reviews: author updates own" on public.reviews for update to authenticated using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy "reviews: participants read" on public.reviews for select to authenticated
  using (customer_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));

-- payments: only the paying customer (and admins) can read; nobody writes from the client
create policy "payments: customer reads own" on public.payments for select to authenticated using (customer_id = auth.uid() or public.is_admin());

-- Column-level privileges: clients may only change user-editable fields.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, username, avatar_url, bio, country, city, languages, interests) on public.profiles to authenticated;

revoke insert, update, delete on public.host_profiles from anon, authenticated;
grant update (display_name, tagline, description, experience, session_price, categories, call_types, timezone, is_available, is_published)
  on public.host_profiles to authenticated;

revoke all on public.host_availability from anon;

revoke update, delete on public.bookings from anon, authenticated;
revoke insert on public.bookings from anon;
revoke all on public.payments from anon;
revoke insert, update, delete on public.payments from authenticated;

revoke all on public.reviews from anon;
revoke update, delete on public.reviews from authenticated;
grant update (rating, comment) on public.reviews to authenticated;

-- ---------------------------------------------------------------------
-- Public views — the ONLY public read surface. They run with the view
-- owner's rights (bypassing RLS) and expose whitelisted columns only.
-- ---------------------------------------------------------------------
create view public.public_hosts as
select
  hp.id,
  hp.display_name,
  hp.tagline,
  hp.description,
  hp.experience,
  hp.session_price,
  hp.hourly_rate,
  hp.categories,
  hp.call_types,
  hp.timezone,
  hp.is_available,
  hp.is_verified,
  hp.average_rating,
  hp.review_count,
  hp.total_sessions,
  hp.created_at,
  p.avatar_url,
  p.bio,
  p.country,
  p.city,
  p.languages,
  p.interests,
  p.is_sample,
  coalesce((
    select jsonb_agg(jsonb_build_object('day_of_week', a.day_of_week, 'start_time', a.start_time, 'end_time', a.end_time, 'timezone', a.timezone)
                     order by a.day_of_week, a.start_time)
    from public.host_availability a where a.host_id = hp.id
  ), '[]'::jsonb) as availability
from public.host_profiles hp
join public.profiles p on p.id = hp.user_id
where hp.is_published and p.role = 'host';

create view public.public_reviews as
select r.id, r.host_id, r.rating, r.comment, r.created_at,
       split_part(p.full_name, ' ', 1) as author_name,
       p.country as author_country
from public.reviews r
join public.profiles p on p.id = r.customer_id
join public.host_profiles hp on hp.id = r.host_id
where hp.is_published;

-- A host's incoming bookings with the minimum customer info needed (first name, country).
create view public.my_host_bookings as
select b.id, b.host_id, b.scheduled_at, b.ends_at, b.duration_minutes, b.call_type, b.status,
       b.subtotal, b.host_earnings, b.created_at,
       split_part(p.full_name, ' ', 1) as customer_name,
       p.country as customer_country,
       exists (select 1 from public.reviews r where r.booking_id = b.id) as has_review
from public.bookings b
join public.host_profiles hp on hp.id = b.host_id
join public.profiles p on p.id = b.customer_id
where hp.user_id = auth.uid();

revoke all on public.public_hosts, public.public_reviews, public.my_host_bookings from anon, authenticated;
grant select on public.public_hosts, public.public_reviews to anon, authenticated;
grant select on public.my_host_bookings to authenticated;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.humi_price_quote(numeric, integer, public.call_type) to anon, authenticated;
grant execute on function public.get_host_busy_slots(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.become_host() to authenticated;
grant execute on function public.confirm_booking(uuid) to authenticated;
grant execute on function public.complete_booking(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;

-- ===================== 20261114130000_profile_backfill.sql =====================
-- =====================================================================
-- HUMI — profile safety net
-- Accounts created before the initial migration (or if the sign-up
-- trigger was missing) have no row in public.profiles. This:
--   1. backfills missing profiles / host profiles,
--   2. adds ensure_profile() so the app can self-heal on login,
--   3. makes become_host() create the profile if it's missing.
-- Safe to run more than once.
-- =====================================================================

-- 1. Backfill
insert into public.profiles (id, full_name, role)
select u.id,
       left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(u.email, ''), '@', 1)), 80),
       case when u.raw_user_meta_data ->> 'role' = 'host' then 'host'::public.user_role else 'customer'::public.user_role end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

insert into public.host_profiles (user_id, display_name)
select p.id, left(coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'Host'), 40)
from public.profiles p
where p.role = 'host'
  and not exists (select 1 from public.host_profiles hp where hp.user_id = p.id);

-- 2. Self-healing helper for the signed-in user
create or replace function public.ensure_profile()
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v public.profiles;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  insert into public.profiles (id, full_name, role)
  select u.id,
         left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(u.email, ''), '@', 1)), 80),
         case when u.raw_user_meta_data ->> 'role' = 'host' then 'host'::public.user_role else 'customer'::public.user_role end
  from auth.users u
  where u.id = v_uid
  on conflict (id) do nothing;

  select * into v from public.profiles where id = v_uid;

  if v.role = 'host' then
    insert into public.host_profiles (user_id, display_name)
    values (v_uid, left(coalesce(nullif(split_part(v.full_name, ' ', 1), ''), 'Host'), 40))
    on conflict (user_id) do nothing;
  end if;

  return v;
end $$;

-- 3. become_host now works even if the profile row was missing
create or replace function public.become_host()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  perform public.ensure_profile();
  update public.profiles set role = 'host' where id = v_uid and role = 'customer';
  insert into public.host_profiles (user_id, display_name)
  select p.id, left(coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'Host'), 40) from public.profiles p where p.id = v_uid
  on conflict (user_id) do nothing;
  select id into v_id from public.host_profiles where user_id = v_uid;
  return v_id;
end $$;

revoke execute on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;
revoke execute on function public.become_host() from public, anon;
grant execute on function public.become_host() to authenticated;

-- ===================== 20261114140000_avatar_storage.sql =====================
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

-- ===================== 20261114150000_oauth_profiles.sql =====================
-- =====================================================================
-- HUMI — social sign-in (Google / Apple) profile support
-- OAuth users arrive with provider metadata instead of our sign-up form:
--   Google: full_name / name, avatar_url / picture, email
--   Apple:  usually only email (name only on the very first consent)
-- This makes profile creation read those fields, and lets ensure_profile()
-- fill in a missing name/photo later WITHOUT overwriting user edits or
-- changing the role. Safe to run more than once.
-- =====================================================================

create or replace function public.profile_name_from_meta(meta jsonb, email text)
returns text language sql immutable set search_path = '' as $$
  select left(coalesce(
    nullif(trim(meta ->> 'full_name'), ''),
    nullif(trim(meta ->> 'name'), ''),
    nullif(trim(concat_ws(' ', meta ->> 'given_name', meta ->> 'family_name')), ''),
    nullif(split_part(coalesce(email, ''), '@', 1), ''),
    'Member'
  ), 80);
$$;

create or replace function public.profile_avatar_from_meta(meta jsonb)
returns text language sql immutable set search_path = '' as $$
  select case
    when coalesce(meta ->> 'avatar_url', meta ->> 'picture') ~ '^https://' then coalesce(meta ->> 'avatar_url', meta ->> 'picture')
  end;
$$;

-- New users: role only from our own sign-up form ('host'), never 'admin'; OAuth users start as customers.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role public.user_role := case when new.raw_user_meta_data ->> 'role' = 'host' then 'host' else 'customer' end;
  v_name text := public.profile_name_from_meta(new.raw_user_meta_data, new.email);
begin
  insert into public.profiles (id, full_name, avatar_url, role)
  values (new.id, v_name, public.profile_avatar_from_meta(new.raw_user_meta_data), v_role)
  on conflict (id) do nothing;
  if v_role = 'host' then
    insert into public.host_profiles (user_id, display_name)
    values (new.id, left(coalesce(nullif(split_part(v_name, ' ', 1), ''), 'Host'), 40))
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

-- Called after every sign-in: creates the profile if missing, otherwise only fills EMPTY name/photo.
create or replace function public.ensure_profile()
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  u auth.users;
  v public.profiles;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into u from auth.users where id = v_uid;

  insert into public.profiles (id, full_name, avatar_url, role)
  values (
    v_uid,
    public.profile_name_from_meta(u.raw_user_meta_data, u.email),
    public.profile_avatar_from_meta(u.raw_user_meta_data),
    case when u.raw_user_meta_data ->> 'role' = 'host' then 'host'::public.user_role else 'customer'::public.user_role end
  )
  on conflict (id) do update set
    full_name  = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end,
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);
    -- role is never touched here

  select * into v from public.profiles where id = v_uid;
  if v.role = 'host' then
    insert into public.host_profiles (user_id, display_name)
    values (v_uid, left(coalesce(nullif(split_part(v.full_name, ' ', 1), ''), 'Host'), 40))
    on conflict (user_id) do nothing;
  end if;
  return v;
end $$;

revoke execute on function public.profile_name_from_meta(jsonb, text) from public, anon, authenticated;
revoke execute on function public.profile_avatar_from_meta(jsonb) from public, anon, authenticated;
revoke execute on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;

-- ===================== 20261115100000_profile_region.sql =====================
-- =====================================================================
-- HUMI — state / region on profiles
-- Profiles now store the state/region (e.g. "São Paulo", "California").
-- The old `city` column is kept (no data is deleted) but no longer edited.
-- Safe to run more than once.
-- =====================================================================

alter table public.profiles
  add column if not exists region text check (char_length(region) <= 80);

-- Let users edit it (same column-level rule as the other profile fields).
grant update (region) on public.profiles to authenticated;

-- Expose it on the public host listing (new column appended at the end).
create or replace view public.public_hosts as
select
  hp.id,
  hp.display_name,
  hp.tagline,
  hp.description,
  hp.experience,
  hp.session_price,
  hp.hourly_rate,
  hp.categories,
  hp.call_types,
  hp.timezone,
  hp.is_available,
  hp.is_verified,
  hp.average_rating,
  hp.review_count,
  hp.total_sessions,
  hp.created_at,
  p.avatar_url,
  p.bio,
  p.country,
  p.city,
  p.languages,
  p.interests,
  p.is_sample,
  coalesce((
    select jsonb_agg(jsonb_build_object('day_of_week', a.day_of_week, 'start_time', a.start_time, 'end_time', a.end_time, 'timezone', a.timezone)
                     order by a.day_of_week, a.start_time)
    from public.host_availability a where a.host_id = hp.id
  ), '[]'::jsonb) as availability,
  p.region
from public.host_profiles hp
join public.profiles p on p.id = hp.user_id
where hp.is_published and p.role = 'host';

revoke all on public.public_hosts from anon, authenticated;
grant select on public.public_hosts to anon, authenticated;

-- ===================== 20261115110000_host_presence.sql =====================
-- =====================================================================
-- HUMI — real "online now" presence for hosts
-- Before: "online" was just the is_available switch, so a host who left
-- the site stayed "online" forever.
-- Now: the site sends a heartbeat every minute while a host has HUMI open.
-- A host is shown online only if the switch is ON *and* the last heartbeat
-- was less than 3 minutes ago. Safe to run more than once.
-- =====================================================================

alter table public.host_profiles add column if not exists last_seen_at timestamptz;

-- Clients can't write last_seen_at directly (it's not in the column grants);
-- only this function sets it — always to the server's clock.
create or replace function public.host_presence(p_online boolean default true)
returns void language sql security definer set search_path = '' as $$
  update public.host_profiles
     set last_seen_at = case when p_online then now() else null end
   where user_id = auth.uid();
$$;

revoke execute on function public.host_presence(boolean) from public, anon;
grant execute on function public.host_presence(boolean) to authenticated;

-- Public listing gets a computed is_online (appended as the last column).
create or replace view public.public_hosts as
select
  hp.id,
  hp.display_name,
  hp.tagline,
  hp.description,
  hp.experience,
  hp.session_price,
  hp.hourly_rate,
  hp.categories,
  hp.call_types,
  hp.timezone,
  hp.is_available,
  hp.is_verified,
  hp.average_rating,
  hp.review_count,
  hp.total_sessions,
  hp.created_at,
  p.avatar_url,
  p.bio,
  p.country,
  p.city,
  p.languages,
  p.interests,
  p.is_sample,
  coalesce((
    select jsonb_agg(jsonb_build_object('day_of_week', a.day_of_week, 'start_time', a.start_time, 'end_time', a.end_time, 'timezone', a.timezone)
                     order by a.day_of_week, a.start_time)
    from public.host_availability a where a.host_id = hp.id
  ), '[]'::jsonb) as availability,
  p.region,
  coalesce(hp.is_available and hp.last_seen_at > now() - interval '3 minutes', false) as is_online
from public.host_profiles hp
join public.profiles p on p.id = hp.user_id
where hp.is_published and p.role = 'host';

revoke all on public.public_hosts from anon, authenticated;
grant select on public.public_hosts to anon, authenticated;

-- ===================== 20261115120000_wallet_and_calls.sql =====================
-- =====================================================================
-- HUMI — per-minute billing: wallet, immutable ledger, top-ups,
-- per-minute host pricing, call sessions, server-side billing,
-- host earnings (75%) and platform commission (25%, configurable).
--
-- Money is ALWAYS integer cents (BRL). Balances and earnings only change
-- through SECURITY DEFINER functions; clients can read their own rows only.
-- Billing ticks and top-up confirmation are service_role only (called by
-- the Next.js server after verifying LiveKit / the payment provider).
-- Run once, after the previous migrations.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Settings (backend-configurable; admins edit with SQL)
-- ---------------------------------------------------------------------
create table public.platform_settings (
  key         text primary key,
  value       bigint not null,
  description text not null,
  updated_at  timestamptz not null default now()
);

insert into public.platform_settings (key, value, description) values
  ('commission_bps',             2500,   'HUMI commission in basis points (2500 = 25%). Host receives the rest.'),
  ('price_min_cents_per_minute', 50,     'Minimum host price per minute (cents).'),
  ('price_max_cents_per_minute', 2000,   'Maximum host price per minute (cents).'),
  ('topup_min_cents',            1000,   'Minimum top-up (cents).'),
  ('topup_max_cents',            100000, 'Maximum top-up (cents).'),
  ('call_min_start_seconds',     60,     'Balance must cover at least this many seconds to start a call.'),
  ('call_grace_seconds',         45,     'Gap between connected checks that is still billed; longer gaps are not charged.'),
  ('call_ring_timeout_seconds',  90,     'A call not connected within this time fails (never charged).'),
  ('earnings_hold_days',         7,      'Days before host earnings become available for payout.')
on conflict (key) do nothing;

create or replace function public.setting(p_key text)
returns bigint language sql stable security definer set search_path = '' as $$
  select value from public.platform_settings where key = p_key;
$$;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.ledger_kind as enum ('topup', 'call_charge', 'refund', 'adjustment');
create type public.topup_status as enum ('pending', 'approved', 'declined', 'refunded', 'canceled');
create type public.call_status as enum ('ringing', 'connected', 'ended', 'failed');
create type public.earning_kind as enum ('call', 'payout', 'refund', 'adjustment');
create type public.payout_status as enum ('requested', 'processing', 'paid', 'failed', 'canceled');

-- ---------------------------------------------------------------------
-- Host per-minute pricing (audio and video independent)
-- ---------------------------------------------------------------------
create table public.host_pricing (
  host_id                    uuid primary key references public.host_profiles (id) on delete cascade,
  audio_cents_per_minute     integer not null default 100 check (audio_cents_per_minute > 0),
  video_cents_per_minute     integer check (video_cents_per_minute is null or video_cents_per_minute > 0),
  currency                   text not null default 'BRL',
  updated_at                 timestamptz not null default now()
);

-- Every existing and future host gets a row (default R$ 1,00/min audio, R$ 1,20/min video).
insert into public.host_pricing (host_id, audio_cents_per_minute, video_cents_per_minute)
select id, 100, 120 from public.host_profiles on conflict do nothing;

create or replace function public.host_profiles_create_pricing()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.host_pricing (host_id, audio_cents_per_minute, video_cents_per_minute) values (new.id, 100, 120)
  on conflict do nothing;
  return new;
end $$;
create trigger host_profiles_create_pricing after insert on public.host_profiles
  for each row execute function public.host_profiles_create_pricing();

-- Hosts change prices only through this function (limits come from platform_settings).
create or replace function public.set_host_pricing(p_audio_cents integer, p_video_cents integer)
returns public.host_pricing language plpgsql security definer set search_path = '' as $$
declare
  v_min bigint := public.setting('price_min_cents_per_minute');
  v_max bigint := public.setting('price_max_cents_per_minute');
  v_host uuid;
  v public.host_pricing;
begin
  select id into v_host from public.host_profiles where user_id = auth.uid();
  if v_host is null then raise exception 'Only hosts can set prices.' using errcode = '42501'; end if;
  if p_audio_cents is null or p_audio_cents < v_min or p_audio_cents > v_max
     or (p_video_cents is not null and (p_video_cents < v_min or p_video_cents > v_max)) then
    raise exception 'Price must be between % and % cents per minute.', v_min, v_max using errcode = 'P0001', hint = 'price_out_of_range';
  end if;
  insert into public.host_pricing (host_id, audio_cents_per_minute, video_cents_per_minute, updated_at)
  values (v_host, p_audio_cents, p_video_cents, now())
  on conflict (host_id) do update set audio_cents_per_minute = excluded.audio_cents_per_minute,
                                      video_cents_per_minute = excluded.video_cents_per_minute,
                                      updated_at = now()
  returning * into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Customer wallet + immutable ledger
-- ---------------------------------------------------------------------
create table public.wallets (
  user_id        uuid primary key references public.profiles (id) on delete restrict,
  balance_cents  bigint not null default 0 check (balance_cents >= 0),
  currency       text not null default 'BRL',
  updated_at     timestamptz not null default now()
);

create table public.wallet_transactions (
  id                   bigint generated always as identity primary key,
  user_id              uuid not null references public.profiles (id) on delete restrict,
  kind                 public.ledger_kind not null,
  amount_cents         bigint not null check (amount_cents <> 0), -- + credit, − debit
  balance_after_cents  bigint not null check (balance_after_cents >= 0),
  reference_id         uuid,               -- top-up id or call id
  idempotency_key      text not null unique,
  livemode             boolean not null,   -- false = test money
  description          text not null,
  created_at           timestamptz not null default now()
);
create index wallet_transactions_user_idx on public.wallet_transactions (user_id, created_at desc);

create table public.wallet_topups (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete restrict,
  amount_cents         bigint not null check (amount_cents > 0),
  currency             text not null default 'BRL',
  provider             text not null,                -- 'test' until a real provider is integrated
  provider_payment_id  text,
  method               text,                         -- pix, card, …
  status               public.topup_status not null default 'pending',
  livemode             boolean not null default false,
  failure_reason       text,
  created_at           timestamptz not null default now(),
  confirmed_at         timestamptz,
  updated_at           timestamptz not null default now(),
  constraint wallet_topups_provider_payment_unique unique (provider, provider_payment_id)
);
create index wallet_topups_user_idx on public.wallet_topups (user_id, created_at desc);

-- Ledgers are append-only.
create or replace function public.forbid_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Ledger rows are immutable (%).', tg_table_name using errcode = '42501';
end $$;
create trigger wallet_transactions_immutable before update or delete on public.wallet_transactions
  for each row execute function public.forbid_mutation();

-- Internal: atomic credit/debit with row lock; never negative; idempotent by key.
create or replace function public.wallet_apply(p_user uuid, p_kind public.ledger_kind, p_amount bigint, p_ref uuid, p_key text, p_livemode boolean, p_desc text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_balance bigint;
begin
  if exists (select 1 from public.wallet_transactions where idempotency_key = p_key) then
    select balance_cents into v_balance from public.wallets where user_id = p_user;
    return v_balance; -- already applied
  end if;
  insert into public.wallets (user_id) values (p_user) on conflict do nothing;
  select balance_cents into v_balance from public.wallets where user_id = p_user for update;
  if v_balance + p_amount < 0 then
    raise exception 'Insufficient balance.' using errcode = 'P0001', hint = 'insufficient_balance';
  end if;
  update public.wallets set balance_cents = v_balance + p_amount, updated_at = now() where user_id = p_user;
  insert into public.wallet_transactions (user_id, kind, amount_cents, balance_after_cents, reference_id, idempotency_key, livemode, description)
  values (p_user, p_kind, p_amount, v_balance + p_amount, p_ref, p_key, p_livemode, p_desc);
  return v_balance + p_amount;
end $$;

-- Customer starts a top-up (pending). Never credits anything.
create or replace function public.create_topup(p_amount_cents bigint, p_provider text, p_method text)
returns public.wallet_topups language plpgsql security definer set search_path = '' as $$
declare v public.wallet_topups;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_amount_cents < public.setting('topup_min_cents') or p_amount_cents > public.setting('topup_max_cents') then
    raise exception 'Top-up must be between % and % cents.', public.setting('topup_min_cents'), public.setting('topup_max_cents')
      using errcode = 'P0001', hint = 'topup_out_of_range';
  end if;
  insert into public.wallets (user_id) values (auth.uid()) on conflict do nothing;
  insert into public.wallet_topups (user_id, amount_cents, provider, method, livemode)
  values (auth.uid(), p_amount_cents, p_provider, p_method, p_provider <> 'test')
  returning * into v;
  return v;
end $$;

-- Provider webhook (service_role only): idempotent; credits ONLY on approval, ONLY once,
-- and only if the confirmed amount matches what was requested.
create or replace function public.confirm_topup(p_topup_id uuid, p_provider text, p_provider_payment_id text, p_amount_cents bigint, p_status public.topup_status, p_method text default null, p_reason text default null)
returns public.wallet_topups language plpgsql security definer set search_path = '' as $$
declare v public.wallet_topups;
begin
  select * into v from public.wallet_topups where id = p_topup_id for update;
  if not found or v.provider <> p_provider then raise exception 'Unknown top-up.' using errcode = 'P0001'; end if;
  if p_status = 'approved' then
    if v.status = 'approved' then return v; end if;                 -- repeated webhook: no-op
    if v.status <> 'pending' then raise exception 'Top-up is %.', v.status using errcode = 'P0001'; end if;
    if p_amount_cents <> v.amount_cents then raise exception 'Amount mismatch.' using errcode = 'P0001', hint = 'amount_mismatch'; end if;
    update public.wallet_topups set status = 'approved', provider_payment_id = p_provider_payment_id, method = coalesce(p_method, method),
           confirmed_at = now(), updated_at = now() where id = v.id returning * into v;
    perform public.wallet_apply(v.user_id, 'topup', v.amount_cents, v.id, 'topup:' || v.id, v.livemode,
                                'Top-up' || case when v.livemode then '' else ' (test)' end);
  elsif p_status in ('declined', 'canceled') then
    if v.status = 'pending' then
      update public.wallet_topups set status = p_status, provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
             failure_reason = p_reason, updated_at = now() where id = v.id returning * into v;
    end if;
  elsif p_status = 'refunded' then
    if v.status = 'approved' then
      -- Remove the credit (fails if already spent; such cases need manual review).
      perform public.wallet_apply(v.user_id, 'refund', -v.amount_cents, v.id, 'topup-refund:' || v.id, v.livemode, 'Top-up refunded');
      update public.wallet_topups set status = 'refunded', updated_at = now() where id = v.id returning * into v;
    end if;
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Calls + billing
-- ---------------------------------------------------------------------
create table public.call_sessions (
  id                      uuid primary key default gen_random_uuid(),
  booking_id              uuid references public.bookings (id) on delete set null,
  customer_id             uuid not null references public.profiles (id) on delete restrict,
  host_id                 uuid not null references public.host_profiles (id) on delete restrict,
  call_type               public.call_type not null,
  price_cents_per_minute  integer not null check (price_cents_per_minute > 0),  -- snapshot at start
  commission_bps          integer not null check (commission_bps between 0 and 10000),
  room_name               text not null unique,
  status                  public.call_status not null default 'ringing',
  end_reason              text,
  livemode                boolean not null default false,
  created_at              timestamptz not null default now(),
  connected_at            timestamptz,
  last_connected_at       timestamptz,     -- last server-verified moment both were in the room
  last_tick_at            timestamptz,
  ended_at                timestamptz,
  billed_seconds          integer not null default 0 check (billed_seconds >= 0),
  charged_cents           bigint not null default 0 check (charged_cents >= 0),
  host_earnings_cents     bigint not null default 0 check (host_earnings_cents >= 0),
  platform_fee_cents      bigint not null default 0 check (platform_fee_cents >= 0),
  constraint call_split_consistent check (charged_cents = host_earnings_cents + platform_fee_cents)
);
create index call_sessions_customer_idx on public.call_sessions (customer_id, created_at desc);
create index call_sessions_host_idx on public.call_sessions (host_id, created_at desc);
-- At most one active call per customer and per host.
create unique index call_sessions_one_active_customer on public.call_sessions (customer_id) where status in ('ringing', 'connected');
create unique index call_sessions_one_active_host on public.call_sessions (host_id) where status in ('ringing', 'connected');

create table public.call_billing_records (
  id               bigint generated always as identity primary key,
  call_id          uuid not null references public.call_sessions (id) on delete restrict,
  seconds          integer not null check (seconds >= 0),
  amount_cents     bigint not null check (amount_cents >= 0),
  host_cents       bigint not null check (host_cents >= 0),
  platform_cents   bigint not null check (platform_cents >= 0),
  idempotency_key  text not null unique,
  created_at       timestamptz not null default now(),
  constraint billing_split_consistent check (amount_cents = host_cents + platform_cents)
);
create trigger call_billing_records_immutable before update or delete on public.call_billing_records
  for each row execute function public.forbid_mutation();

create table public.host_earnings (
  id               bigint generated always as identity primary key,
  host_id          uuid not null references public.host_profiles (id) on delete restrict,
  kind             public.earning_kind not null,
  amount_cents     bigint not null check (amount_cents <> 0),  -- + earned, − paid out / reversed
  call_id          uuid references public.call_sessions (id) on delete restrict,
  payout_id        uuid,
  available_at     timestamptz not null default now(),
  livemode         boolean not null,
  idempotency_key  text not null unique,
  created_at       timestamptz not null default now()
);
create index host_earnings_host_idx on public.host_earnings (host_id, created_at desc);
create trigger host_earnings_immutable before update or delete on public.host_earnings
  for each row execute function public.forbid_mutation();

create table public.platform_commissions (
  id               bigint generated always as identity primary key,
  call_id          uuid not null references public.call_sessions (id) on delete restrict,
  amount_cents     bigint not null check (amount_cents > 0),
  livemode         boolean not null,
  idempotency_key  text not null unique,
  created_at       timestamptz not null default now()
);
create trigger platform_commissions_immutable before update or delete on public.platform_commissions
  for each row execute function public.forbid_mutation();

create table public.payout_accounts (
  host_id              uuid primary key references public.host_profiles (id) on delete cascade,
  provider             text,
  provider_account_id  text,
  status               text not null default 'not_connected' check (status in ('not_connected', 'pending_verification', 'active', 'restricted')),
  updated_at           timestamptz not null default now()
);

create table public.payout_records (
  id                  uuid primary key default gen_random_uuid(),
  host_id             uuid not null references public.host_profiles (id) on delete restrict,
  amount_cents        bigint not null check (amount_cents > 0),
  status              public.payout_status not null default 'requested',
  provider            text,
  provider_payout_id  text,
  livemode            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Customer starts a call (signed in). Checks balance; nothing is charged here.
create or replace function public.start_call(p_host_id uuid, p_call_type public.call_type, p_booking_id uuid default null)
returns public.call_sessions language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_host public.host_profiles;
  v_price integer;
  v_balance bigint;
  v_needed bigint;
  v public.call_sessions;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into v_host from public.host_profiles where id = p_host_id;
  if not found or not v_host.is_published then raise exception 'This host is not available.' using errcode = 'P0001', hint = 'host_unavailable'; end if;
  if v_host.user_id = v_uid then raise exception 'You can''t call yourself.' using errcode = 'P0001', hint = 'self_call'; end if;
  if not (p_call_type = any (v_host.call_types)) then raise exception 'This host doesn''t offer % calls.', p_call_type using errcode = 'P0001'; end if;
  if p_booking_id is not null and not exists (
    select 1 from public.bookings b where b.id = p_booking_id and b.customer_id = v_uid and b.host_id = p_host_id and b.status = 'confirmed'
  ) then raise exception 'Booking not found.' using errcode = 'P0001'; end if;

  select case when p_call_type = 'video' then coalesce(video_cents_per_minute, audio_cents_per_minute) else audio_cents_per_minute end
    into v_price from public.host_pricing where host_id = p_host_id;
  if v_price is null then raise exception 'This host has no price set.' using errcode = 'P0001'; end if;

  -- Close stale calls (nobody connected for longer than the grace period) so they don't block.
  update public.call_sessions set status = case when status = 'ringing' then 'failed'::public.call_status else 'ended'::public.call_status end,
         end_reason = case when status = 'ringing' then 'failed_to_connect' else 'dropped' end, ended_at = now()
   where (customer_id = v_uid or host_id = p_host_id) and status in ('ringing', 'connected')
     and coalesce(last_connected_at, created_at) < now() - make_interval(secs => greatest(public.setting('call_grace_seconds'), public.setting('call_ring_timeout_seconds')));

  insert into public.wallets (user_id) values (v_uid) on conflict do nothing;
  select balance_cents into v_balance from public.wallets where user_id = v_uid;
  v_needed := ceil(v_price * public.setting('call_min_start_seconds') / 60.0);
  if v_balance < v_needed then
    raise exception 'Add at least % cents to start this call.', v_needed - v_balance using errcode = 'P0001', hint = 'insufficient_balance';
  end if;

  insert into public.call_sessions (booking_id, customer_id, host_id, call_type, price_cents_per_minute, commission_bps, room_name, livemode)
  values (p_booking_id, v_uid, p_host_id, p_call_type, v_price, public.setting('commission_bps'),
          'humi-' || replace(gen_random_uuid()::text, '-', ''), false)
  returning * into v;
  return v;
exception when unique_violation then
  raise exception 'There is already an active call for you or this host.' using errcode = 'P0001', hint = 'call_in_progress';
end $$;

-- Ends a call (service_role; the server verifies who is hanging up).
create or replace function public.finish_call(p_call_id uuid, p_reason text)
returns public.call_sessions language plpgsql security definer set search_path = '' as $$
declare v public.call_sessions;
begin
  update public.call_sessions
     set status = case when status = 'ringing' then 'failed'::public.call_status else 'ended'::public.call_status end,
         end_reason = case when status = 'ringing' and p_reason not in ('customer_hangup', 'host_hangup', 'declined') then 'failed_to_connect'
                           when status = 'ringing' then p_reason else p_reason end,
         ended_at = now()
   where id = p_call_id and status in ('ringing', 'connected')
  returning * into v;
  if not found then select * into v from public.call_sessions where id = p_call_id; end if;
  return v;
end $$;

-- Core billing (service_role only). Called by the server every few seconds with the result of
-- asking LiveKit whether BOTH participants are in the room. Uses only the database clock.
--   * Only the time between two consecutive "both connected" checks is billed, and only if the
--     gap is within the grace period (drops/outages are not charged).
--   * Charge is per second: total due = floor(price × billed_seconds / 60); each tick charges
--     the difference, so rounding never drifts and nothing is charged twice.
--   * The wallet is locked; if it runs out the call ends ('insufficient_funds'), never negative.
create or replace function public.call_tick(p_call_id uuid, p_both_connected boolean)
returns public.call_sessions language plpgsql security definer set search_path = '' as $$
declare
  c public.call_sessions;
  v_now timestamptz := now();
  v_grace bigint := public.setting('call_grace_seconds');
  v_gap numeric;
  v_secs integer := 0;
  v_balance bigint;
  v_due bigint;
  v_delta bigint;
  v_host_due bigint;
  v_host_delta bigint;
  v_plat_delta bigint;
  v_out_of_funds boolean := false;
  v_key text;
begin
  select * into c from public.call_sessions where id = p_call_id for update;
  if not found then raise exception 'Unknown call.' using errcode = 'P0001'; end if;
  if c.status in ('ended', 'failed') then return c; end if;

  if not p_both_connected then
    if c.status = 'ringing' and v_now - c.created_at > make_interval(secs => public.setting('call_ring_timeout_seconds')) then
      update public.call_sessions set status = 'failed', end_reason = 'failed_to_connect', ended_at = v_now, last_tick_at = v_now
       where id = c.id returning * into c;
    elsif c.status = 'connected' and v_now - c.last_connected_at > make_interval(secs => v_grace) then
      update public.call_sessions set status = 'ended', end_reason = 'dropped', ended_at = v_now, last_tick_at = v_now
       where id = c.id returning * into c;
    else
      update public.call_sessions set last_tick_at = v_now where id = c.id returning * into c;
    end if;
    return c;
  end if;

  if c.status = 'ringing' then
    -- Billing starts now: nothing is charged for ringing time.
    update public.call_sessions set status = 'connected', connected_at = v_now, last_connected_at = v_now, last_tick_at = v_now
     where id = c.id returning * into c;
    return c;
  end if;

  v_gap := extract(epoch from (v_now - c.last_connected_at));
  if v_gap <= v_grace then
    v_secs := floor(v_gap)::integer;
  end if;

  if v_secs > 0 then
    v_due := floor(c.price_cents_per_minute::numeric * (c.billed_seconds + v_secs) / 60);
    v_delta := v_due - c.charged_cents;

    insert into public.wallets (user_id) values (c.customer_id) on conflict do nothing;
    select balance_cents into v_balance from public.wallets where user_id = c.customer_id for update;
    if v_delta >= v_balance then
      v_delta := v_balance;     -- take what's left, then end the call
      v_out_of_funds := true;
    end if;

    if v_delta > 0 then
      v_key := 'call:' || c.id || ':' || (c.billed_seconds + v_secs);
      perform public.wallet_apply(c.customer_id, 'call_charge', -v_delta, c.id, v_key, c.livemode, 'Call charge');
      -- Host share is computed on the running total so cents never drift.
      v_host_due := floor((c.charged_cents + v_delta)::numeric * (10000 - c.commission_bps) / 10000);
      v_host_delta := v_host_due - c.host_earnings_cents;
      v_plat_delta := v_delta - v_host_delta;
      insert into public.call_billing_records (call_id, seconds, amount_cents, host_cents, platform_cents, idempotency_key)
      values (c.id, v_secs, v_delta, v_host_delta, v_plat_delta, v_key);
      if v_host_delta > 0 then
        insert into public.host_earnings (host_id, kind, amount_cents, call_id, available_at, livemode, idempotency_key)
        values (c.host_id, 'call', v_host_delta, c.id, v_now + make_interval(days => public.setting('earnings_hold_days')::int), c.livemode, v_key);
      end if;
      if v_plat_delta > 0 then
        insert into public.platform_commissions (call_id, amount_cents, livemode, idempotency_key) values (c.id, v_plat_delta, c.livemode, v_key);
      end if;
    end if;

    update public.call_sessions set
      billed_seconds = billed_seconds + v_secs,
      charged_cents = charged_cents + greatest(v_delta, 0),
      host_earnings_cents = host_earnings_cents + greatest(coalesce(v_host_delta, 0), 0),
      platform_fee_cents = platform_fee_cents + greatest(coalesce(v_plat_delta, 0), 0),
      last_connected_at = last_connected_at + make_interval(secs => v_secs),
      last_tick_at = v_now,
      status = case when v_out_of_funds then 'ended'::public.call_status else status end,
      end_reason = case when v_out_of_funds then 'insufficient_funds' else end_reason end,
      ended_at = case when v_out_of_funds then v_now else ended_at end
    where id = c.id returning * into c;
  elsif v_gap > v_grace then
    -- Came back after an outage longer than the grace period: restart the clock, don't bill the gap.
    update public.call_sessions set last_connected_at = v_now, last_tick_at = v_now where id = c.id returning * into c;
  else
    update public.call_sessions set last_tick_at = v_now where id = c.id returning * into c;
  end if;
  return c;
end $$;

-- ---------------------------------------------------------------------
-- Read helpers for the UI
-- ---------------------------------------------------------------------
create or replace view public.my_host_earnings_summary as
select hp.id as host_id,
       coalesce(sum(e.amount_cents) filter (where e.kind = 'call'), 0)                                  as total_earned_cents,
       coalesce(sum(e.amount_cents) filter (where e.available_at <= now()), 0)                           as available_cents,
       coalesce(sum(e.amount_cents) filter (where e.available_at > now()), 0)                            as pending_cents,
       (select coalesce(sum(cs.platform_fee_cents), 0) from public.call_sessions cs where cs.host_id = hp.id) as commission_cents,
       (select count(*) from public.call_sessions cs where cs.host_id = hp.id and cs.billed_seconds > 0)     as calls_count,
       (select coalesce(sum(cs.billed_seconds), 0) from public.call_sessions cs where cs.host_id = hp.id)    as billed_seconds
from public.host_profiles hp
left join public.host_earnings e on e.host_id = hp.id
where hp.user_id = auth.uid()
group by hp.id;

-- A participant's calls with the other side's first name (customers never see host user ids, hosts only the guest's first name).
create or replace view public.my_calls as
select cs.id, cs.booking_id, cs.host_id, cs.call_type, cs.price_cents_per_minute, cs.commission_bps, cs.room_name, cs.status,
       cs.end_reason, cs.livemode, cs.created_at, cs.connected_at, cs.ended_at, cs.billed_seconds, cs.charged_cents,
       cs.host_earnings_cents, cs.platform_fee_cents,
       split_part(p.full_name, ' ', 1) as customer_name,
       hp.display_name as host_name,
       (hp.user_id = auth.uid()) as i_am_host
from public.call_sessions cs
join public.profiles p on p.id = cs.customer_id
join public.host_profiles hp on hp.id = cs.host_id
where cs.customer_id = auth.uid() or hp.user_id = auth.uid();

-- Public listing: add per-minute prices (appended columns).
create or replace view public.public_hosts as
select
  hp.id, hp.display_name, hp.tagline, hp.description, hp.experience, hp.session_price, hp.hourly_rate,
  hp.categories, hp.call_types, hp.timezone, hp.is_available, hp.is_verified, hp.average_rating,
  hp.review_count, hp.total_sessions, hp.created_at,
  p.avatar_url, p.bio, p.country, p.city, p.languages, p.interests, p.is_sample,
  coalesce((
    select jsonb_agg(jsonb_build_object('day_of_week', a.day_of_week, 'start_time', a.start_time, 'end_time', a.end_time, 'timezone', a.timezone)
                     order by a.day_of_week, a.start_time)
    from public.host_availability a where a.host_id = hp.id
  ), '[]'::jsonb) as availability,
  p.region,
  coalesce(hp.is_available and hp.last_seen_at > now() - interval '3 minutes', false) as is_online,
  pr.audio_cents_per_minute,
  pr.video_cents_per_minute
from public.host_profiles hp
join public.profiles p on p.id = hp.user_id
left join public.host_pricing pr on pr.host_id = hp.id
where hp.is_published and p.role = 'host';

-- ---------------------------------------------------------------------
-- Bookings become free reservations (billing happens per minute during the call).
-- Old rows keep their historical amounts; new rows store zero.
-- ---------------------------------------------------------------------
create or replace function public.bookings_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  return new; -- no demo payment rows any more: reservations are free
end $$;

create or replace function public.bookings_zero_prices()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.subtotal := 0; new.total_price := 0; new.platform_fee := 0; new.host_earnings := 0; new.currency := 'BRL';
  return new;
end $$;
-- Runs after the validation trigger (trigger names fire alphabetically: bookings_before_insert < bookings_zz_prices).
create trigger bookings_zz_prices before insert on public.bookings for each row execute function public.bookings_zero_prices();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.platform_settings     enable row level security;
alter table public.host_pricing          enable row level security;
alter table public.wallets               enable row level security;
alter table public.wallet_transactions   enable row level security;
alter table public.wallet_topups         enable row level security;
alter table public.call_sessions         enable row level security;
alter table public.call_billing_records  enable row level security;
alter table public.host_earnings         enable row level security;
alter table public.platform_commissions  enable row level security;
alter table public.payout_accounts       enable row level security;
alter table public.payout_records        enable row level security;

create policy "settings: public read" on public.platform_settings for select to anon, authenticated using (true);
create policy "pricing: public read" on public.host_pricing for select to anon, authenticated using (true);
create policy "wallets: own" on public.wallets for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "wallet tx: own" on public.wallet_transactions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "topups: own" on public.wallet_topups for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "calls: participants" on public.call_sessions for select to authenticated
  using (customer_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));
create policy "billing: participants" on public.call_billing_records for select to authenticated
  using (exists (select 1 from public.call_sessions cs where cs.id = call_id and (cs.customer_id = auth.uid()
         or exists (select 1 from public.host_profiles hp where hp.id = cs.host_id and hp.user_id = auth.uid())))) ;
create policy "earnings: own host" on public.host_earnings for select to authenticated
  using (public.is_admin() or exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));
create policy "commissions: admin" on public.platform_commissions for select to authenticated using (public.is_admin());
create policy "payout accounts: own host" on public.payout_accounts for select to authenticated
  using (public.is_admin() or exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));
create policy "payouts: own host" on public.payout_records for select to authenticated
  using (public.is_admin() or exists (select 1 from public.host_profiles hp where hp.id = host_id and hp.user_id = auth.uid()));

-- No client writes anywhere in the money tables.
revoke insert, update, delete on public.platform_settings, public.host_pricing, public.wallets, public.wallet_transactions,
  public.wallet_topups, public.call_sessions, public.call_billing_records, public.host_earnings, public.platform_commissions,
  public.payout_accounts, public.payout_records from anon, authenticated;
revoke all on public.wallets, public.wallet_transactions, public.wallet_topups, public.call_sessions, public.call_billing_records,
  public.host_earnings, public.platform_commissions, public.payout_accounts, public.payout_records from anon;

revoke all on public.public_hosts, public.my_host_earnings_summary, public.my_calls from anon, authenticated;
grant select on public.public_hosts to anon, authenticated;
grant select on public.my_host_earnings_summary, public.my_calls to authenticated;

-- Function privileges: clients may only start top-ups/calls and set their own price.
revoke execute on function public.setting(text), public.wallet_apply(uuid, public.ledger_kind, bigint, uuid, text, boolean, text),
  public.create_topup(bigint, text, text), public.confirm_topup(uuid, text, text, bigint, public.topup_status, text, text),
  public.start_call(uuid, public.call_type, uuid), public.finish_call(uuid, text), public.call_tick(uuid, boolean),
  public.set_host_pricing(integer, integer), public.host_profiles_create_pricing(), public.bookings_zero_prices(), public.forbid_mutation()
  from public, anon, authenticated;
grant execute on function public.create_topup(bigint, text, text) to authenticated;
grant execute on function public.start_call(uuid, public.call_type, uuid) to authenticated;
grant execute on function public.set_host_pricing(integer, integer) to authenticated;
grant execute on function public.confirm_topup(uuid, text, text, bigint, public.topup_status, text, text) to service_role;
grant execute on function public.call_tick(uuid, boolean) to service_role;
grant execute on function public.finish_call(uuid, text) to service_role;
grant execute on function public.setting(text) to service_role;

-- ===================== 20261115130000_hide_commission.sql =====================
-- =====================================================================
-- HUMI — keep the platform commission private
-- The commission rate and per-call platform amounts are no longer readable
-- by customers or hosts through the API (only admins / the server).
-- Hosts still see what THEY earn; customers see what THEY paid.
-- Billing itself is unchanged. Safe to run more than once.
-- =====================================================================

-- Settings: everything public except the commission rate.
drop policy if exists "settings: public read" on public.platform_settings;
drop policy if exists "settings: public read (no commission)" on public.platform_settings;
create policy "settings: public read (no commission)" on public.platform_settings for select to anon, authenticated
  using (key <> 'commission_bps' or public.is_admin());

-- Raw call rows and per-tick billing records carry the split: admin/server only.
drop policy if exists "calls: participants" on public.call_sessions;
drop policy if exists "calls: admin" on public.call_sessions;
create policy "calls: admin" on public.call_sessions for select to authenticated using (public.is_admin());

drop policy if exists "billing: participants" on public.call_billing_records;
drop policy if exists "billing: admin" on public.call_billing_records;
create policy "billing: admin" on public.call_billing_records for select to authenticated using (public.is_admin());

-- Participants read calls through this view: no commission rate, no platform amount,
-- and host earnings only for the host.
drop view if exists public.my_calls;
create view public.my_calls as
select cs.id, cs.booking_id, cs.host_id, cs.call_type, cs.price_cents_per_minute, cs.room_name, cs.status,
       cs.end_reason, cs.livemode, cs.created_at, cs.connected_at, cs.ended_at, cs.billed_seconds, cs.charged_cents,
       case when hp.user_id = auth.uid() then cs.host_earnings_cents end as host_earnings_cents,
       split_part(p.full_name, ' ', 1) as customer_name,
       hp.display_name as host_name,
       (hp.user_id = auth.uid()) as i_am_host
from public.call_sessions cs
join public.profiles p on p.id = cs.customer_id
join public.host_profiles hp on hp.id = cs.host_id
where cs.customer_id = auth.uid() or hp.user_id = auth.uid();

drop view if exists public.my_host_earnings_summary;
create view public.my_host_earnings_summary as
select hp.id as host_id,
       coalesce(sum(e.amount_cents) filter (where e.kind = 'call'), 0)        as total_earned_cents,
       coalesce(sum(e.amount_cents) filter (where e.available_at <= now()), 0) as available_cents,
       coalesce(sum(e.amount_cents) filter (where e.available_at > now()), 0)  as pending_cents,
       (select count(*) from public.call_sessions cs where cs.host_id = hp.id and cs.billed_seconds > 0)  as calls_count,
       (select coalesce(sum(cs.billed_seconds), 0) from public.call_sessions cs where cs.host_id = hp.id) as billed_seconds
from public.host_profiles hp
left join public.host_earnings e on e.host_id = hp.id
where hp.user_id = auth.uid()
group by hp.id;

revoke all on public.my_calls, public.my_host_earnings_summary from anon, authenticated;
grant select on public.my_calls, public.my_host_earnings_summary to authenticated;

-- Lets a host preview what they'd receive per minute for a price, without exposing the rate.
create or replace function public.host_net_cents(p_price_cents integer)
returns integer language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.host_profiles where user_id = auth.uid()) then
    raise exception 'Only hosts can preview earnings.' using errcode = '42501';
  end if;
  return floor(p_price_cents::numeric * (10000 - public.setting('commission_bps')) / 10000);
end $$;

revoke execute on function public.host_net_cents(integer) from public, anon;
grant execute on function public.host_net_cents(integer) to authenticated;

-- ===================== 20261115140000_user_reports.sql =====================
-- =====================================================================
-- HUMI — reporting users (in a call, after a call, from a profile or a booking)
-- Reporters never need the other person's user id: the server resolves who
-- the other side is from the call / booking / host profile.
-- Reports are private: the reporter sees their own; admins see all.
-- Safe to run more than once.
-- =====================================================================

-- Fix from 20261115130000: visitors (anon) got "permission denied for function is_admin"
-- when reading public settings. Separate policies: anon never calls is_admin().
drop policy if exists "settings: public read (no commission)" on public.platform_settings;
drop policy if exists "settings: anon read (no commission)" on public.platform_settings;
drop policy if exists "settings: signed-in read (no commission)" on public.platform_settings;
create policy "settings: anon read (no commission)" on public.platform_settings for select to anon
  using (key <> 'commission_bps');
create policy "settings: signed-in read (no commission)" on public.platform_settings for select to authenticated
  using (key <> 'commission_bps' or public.is_admin());

do $$ begin
  create type public.report_reason as enum (
    'harassment', 'inappropriate_content', 'sexual_content', 'hate_speech',
    'spam_or_scam', 'off_platform_payment', 'underage', 'safety_concern', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('open', 'reviewing', 'action_taken', 'dismissed');
exception when duplicate_object then null; end $$;

create table if not exists public.user_reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references public.profiles (id) on delete cascade,
  reported_user_id  uuid not null references public.profiles (id) on delete cascade,
  call_id           uuid references public.call_sessions (id) on delete set null,
  booking_id        uuid references public.bookings (id) on delete set null,
  host_profile_id   uuid references public.host_profiles (id) on delete set null,
  context           text not null check (context in ('call', 'booking', 'profile')),
  reason            public.report_reason not null,
  details           text check (char_length(details) <= 1000),
  status            public.report_status not null default 'open',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint user_reports_not_self check (reporter_id <> reported_user_id)
);
create index if not exists user_reports_reported_idx on public.user_reports (reported_user_id, created_at desc);
create index if not exists user_reports_status_idx on public.user_reports (status, created_at desc);
create index if not exists user_reports_reporter_idx on public.user_reports (reporter_id, created_at desc);

alter table public.user_reports enable row level security;
drop policy if exists "reports: own or admin" on public.user_reports;
create policy "reports: own or admin" on public.user_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.user_reports from anon, authenticated;
revoke all on public.user_reports from anon;

-- Exactly one of call / booking / host must be given.
create or replace function public.report_user(
  p_reason public.report_reason,
  p_details text default null,
  p_call_id uuid default null,
  p_booking_id uuid default null,
  p_host_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_context text;
  v_host_user uuid;
  v_customer uuid;
  v_host_profile uuid;
  v_existing uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Please log in to report.' using errcode = '42501'; end if;
  if (p_call_id is not null)::int + (p_booking_id is not null)::int + (p_host_id is not null)::int <> 1 then
    raise exception 'Report one call, booking or profile at a time.' using errcode = 'P0001';
  end if;

  if p_call_id is not null then
    select cs.customer_id, hp.user_id, hp.id into v_customer, v_host_user, v_host_profile
    from public.call_sessions cs join public.host_profiles hp on hp.id = cs.host_id where cs.id = p_call_id;
    v_context := 'call';
  elsif p_booking_id is not null then
    select b.customer_id, hp.user_id, hp.id into v_customer, v_host_user, v_host_profile
    from public.bookings b join public.host_profiles hp on hp.id = b.host_id where b.id = p_booking_id;
    v_context := 'booking';
  else
    select hp.user_id, hp.id into v_host_user, v_host_profile from public.host_profiles hp where hp.id = p_host_id;
    v_context := 'profile';
  end if;

  if v_host_user is null then raise exception 'Not found.' using errcode = 'P0001'; end if;

  if v_context = 'profile' then
    if v_host_user = v_uid then raise exception 'You can''t report yourself.' using errcode = 'P0001'; end if;
    v_target := v_host_user;
  elsif v_uid = v_customer then
    v_target := v_host_user;          -- customer reports the host
  elsif v_uid = v_host_user then
    v_target := v_customer;           -- host reports the customer
  else
    raise exception 'You can only report people you talked to.' using errcode = '42501';
  end if;

  -- Same report again within 10 minutes: keep the first one (double clicks, retries).
  select id into v_existing from public.user_reports
   where reporter_id = v_uid and reported_user_id = v_target and created_at > now() - interval '10 minutes'
     and coalesce(call_id, booking_id, host_profile_id) is not distinct from coalesce(p_call_id, p_booking_id, v_host_profile)
   limit 1;
  if v_existing is not null then return v_existing; end if;

  -- Abuse limit.
  if (select count(*) from public.user_reports where reporter_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You''ve sent many reports today. Please contact support if it''s urgent.' using errcode = 'P0001';
  end if;

  insert into public.user_reports (reporter_id, reported_user_id, call_id, booking_id, host_profile_id, context, reason, details)
  values (v_uid, v_target, p_call_id, p_booking_id, v_host_profile, v_context, p_reason, nullif(left(trim(coalesce(p_details, '')), 1000), ''))
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.report_user(public.report_reason, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.report_user(public.report_reason, text, uuid, uuid, uuid) to authenticated;

-- ===================== 20261115150000_count_call_sessions.sql =====================
-- =====================================================================
-- HUMI — session count follows real calls
-- Before: host_profiles.total_sessions only grew when a booking was marked
-- "completed" (old fixed-price model), so per-minute calls never counted.
-- Now: every call that actually happened (time was billed) counts once,
-- when it ends. Old completed bookings without a call still count.
-- Safe to run more than once.
-- =====================================================================

-- Bookings no longer increment the counter (a booking leads to a call, which is what counts).
create or replace function public.bookings_after_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  return new;
end $$;

create or replace function public.call_sessions_count_session()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'ended' and old.status is distinct from 'ended' and new.billed_seconds > 0 then
    update public.host_profiles set total_sessions = total_sessions + 1 where id = new.host_id;
  end if;
  return new;
end $$;

drop trigger if exists call_sessions_count_session on public.call_sessions;
create trigger call_sessions_count_session after update of status on public.call_sessions
  for each row execute function public.call_sessions_count_session();

revoke execute on function public.call_sessions_count_session() from public, anon, authenticated;

-- Recount everything already in the database.
update public.host_profiles hp set total_sessions =
    (select count(*) from public.call_sessions c where c.host_id = hp.id and c.status = 'ended' and c.billed_seconds > 0)
  + (select count(*) from public.bookings b where b.host_id = hp.id and b.status = 'completed'
       and not exists (select 1 from public.call_sessions c where c.booking_id = b.id and c.billed_seconds > 0));

-- ===================== 20261115160000_call_ratings.sql =====================
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

-- ===================== 20261115170000_mercadopago_topups.sql =====================
-- =====================================================================
-- HUMI · Mercado Pago top-ups
-- Top-ups from the Mercado Pago SANDBOX (test credentials) must be test balance, not real money.
-- Before: livemode = provider <> 'test'. Now: real money only for real providers.
-- Safe to run more than once.
-- =====================================================================
create or replace function public.create_topup(p_amount_cents bigint, p_provider text, p_method text)
returns public.wallet_topups language plpgsql security definer set search_path = '' as $$
declare v public.wallet_topups;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_provider not in ('test', 'mercadopago', 'mercadopago_sandbox') then
    raise exception 'Unknown payment provider.' using errcode = 'P0001';
  end if;
  if p_amount_cents < public.setting('topup_min_cents') or p_amount_cents > public.setting('topup_max_cents') then
    raise exception 'Top-up must be between % and % cents.', public.setting('topup_min_cents'), public.setting('topup_max_cents')
      using errcode = 'P0001', hint = 'topup_out_of_range';
  end if;
  insert into public.wallets (user_id) values (auth.uid()) on conflict do nothing;
  insert into public.wallet_topups (user_id, amount_cents, provider, method, livemode)
  values (auth.uid(), p_amount_cents, p_provider, p_method, p_provider = 'mercadopago')
  returning * into v;
  return v;
end $$;

notify pgrst, 'reload schema';

-- ===================== 20261115180000_live_money.sql =====================
-- =====================================================================
-- HUMI · Real money (go-live)
--   * Wallets keep REAL and TEST balances apart (test top-ups never become real money).
--   * A call is "live" only when paid with real balance; its host earnings are then real
--     (before this, every call was stored as a test call).
--   * Test balance can only pay test calls, and can be switched off entirely:
--       update public.platform_settings set value = 0 where key = 'allow_test_calls';
--   * "Available" / "Pending" earnings count real money only.
-- Safe to run more than once.
-- =====================================================================

alter table public.wallets add column if not exists test_balance_cents bigint not null default 0;
alter table public.wallets drop constraint if exists wallets_test_balance_nonneg;
alter table public.wallets add constraint wallets_test_balance_nonneg check (test_balance_cents >= 0);

insert into public.platform_settings (key, value, description) values
  ('allow_test_calls', 1, '1 = test balance can pay test calls; 0 = only real money (set to 0 when live).')
on conflict (key) do nothing;

-- One-time split of existing balances: real money = what came in as real (live) money and is
-- still there; everything else is test balance. Runs only once (marker row).
do $$
begin
  if not exists (select 1 from public.platform_settings where key = 'wallet_split_done') then
    update public.wallets w set
      test_balance_cents = w.balance_cents - least(w.balance_cents, greatest(0, coalesce(r.real_cents, 0))),
      balance_cents      = least(w.balance_cents, greatest(0, coalesce(r.real_cents, 0)))
    from (
      select wl.user_id, (select sum(t.amount_cents) from public.wallet_transactions t where t.user_id = wl.user_id and t.livemode) as real_cents
      from public.wallets wl
    ) r
    where r.user_id = w.user_id;
    insert into public.platform_settings (key, value, description) values ('wallet_split_done', 1, 'Internal marker: wallet balances were split into real and test.');
  end if;
end $$;

-- Ledger writes go to the right pot.
create or replace function public.wallet_apply(p_user uuid, p_kind public.ledger_kind, p_amount bigint, p_ref uuid, p_key text, p_livemode boolean, p_desc text)
returns bigint language plpgsql security definer set search_path = '' as $fn$
declare v_balance bigint;
begin
  if exists (select 1 from public.wallet_transactions where idempotency_key = p_key) then
    select case when p_livemode then balance_cents else test_balance_cents end into v_balance from public.wallets where user_id = p_user;
    return v_balance; -- already applied
  end if;
  insert into public.wallets (user_id) values (p_user) on conflict do nothing;
  select case when p_livemode then balance_cents else test_balance_cents end into v_balance from public.wallets where user_id = p_user for update;
  if v_balance + p_amount < 0 then
    raise exception 'Insufficient balance.' using errcode = 'P0001', hint = 'insufficient_balance';
  end if;
  if p_livemode then
    update public.wallets set balance_cents = v_balance + p_amount, updated_at = now() where user_id = p_user;
  else
    update public.wallets set test_balance_cents = v_balance + p_amount, updated_at = now() where user_id = p_user;
  end if;
  insert into public.wallet_transactions (user_id, kind, amount_cents, balance_after_cents, reference_id, idempotency_key, livemode, description)
  values (p_user, p_kind, p_amount, v_balance + p_amount, p_ref, p_key, p_livemode, p_desc);
  return v_balance + p_amount;
end $fn$;

create or replace function public.start_call(p_host_id uuid, p_call_type public.call_type, p_booking_id uuid default null)
returns public.call_sessions language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_host public.host_profiles;
  v_price integer;
  v_balance bigint;
  v_test bigint;
  v_live boolean;
  v_needed bigint;
  v public.call_sessions;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into v_host from public.host_profiles where id = p_host_id;
  if not found or not v_host.is_published then raise exception 'This host is not available.' using errcode = 'P0001', hint = 'host_unavailable'; end if;
  if v_host.user_id = v_uid then raise exception 'You can''t call yourself.' using errcode = 'P0001', hint = 'self_call'; end if;
  if not (p_call_type = any (v_host.call_types)) then raise exception 'This host doesn''t offer % calls.', p_call_type using errcode = 'P0001'; end if;
  if p_booking_id is not null and not exists (
    select 1 from public.bookings b where b.id = p_booking_id and b.customer_id = v_uid and b.host_id = p_host_id and b.status = 'confirmed'
  ) then raise exception 'Booking not found.' using errcode = 'P0001'; end if;

  select case when p_call_type = 'video' then coalesce(video_cents_per_minute, audio_cents_per_minute) else audio_cents_per_minute end
    into v_price from public.host_pricing where host_id = p_host_id;
  if v_price is null then raise exception 'This host has no price set.' using errcode = 'P0001'; end if;

  -- Close stale calls (nobody connected for longer than the grace period) so they don't block.
  update public.call_sessions set status = case when status = 'ringing' then 'failed'::public.call_status else 'ended'::public.call_status end,
         end_reason = case when status = 'ringing' then 'failed_to_connect' else 'dropped' end, ended_at = now()
   where (customer_id = v_uid or host_id = p_host_id) and status in ('ringing', 'connected')
     and coalesce(last_connected_at, created_at) < now() - make_interval(secs => greatest(public.setting('call_grace_seconds'), public.setting('call_ring_timeout_seconds')));

  insert into public.wallets (user_id) values (v_uid) on conflict do nothing;
  select balance_cents, test_balance_cents into v_balance, v_test from public.wallets where user_id = v_uid;
  v_needed := ceil(v_price * public.setting('call_min_start_seconds') / 60.0);
  -- Real money first: the call is "live" only when paid with real balance.
  -- Test balance can only pay test calls (whose host earnings can never be paid out).
  if v_balance >= v_needed then
    v_live := true;
  elsif coalesce(public.setting('allow_test_calls'), 0) = 1 and v_test >= v_needed then
    v_live := false;
  else
    raise exception 'Add at least % cents to start this call.', v_needed - v_balance using errcode = 'P0001', hint = 'insufficient_balance';
  end if;

  insert into public.call_sessions (booking_id, customer_id, host_id, call_type, price_cents_per_minute, commission_bps, room_name, livemode)
  values (p_booking_id, v_uid, p_host_id, p_call_type, v_price, public.setting('commission_bps'),
          'humi-' || replace(gen_random_uuid()::text, '-', ''), v_live)
  returning * into v;
  return v;
exception when unique_violation then
  raise exception 'There is already an active call for you or this host.' using errcode = 'P0001', hint = 'call_in_progress';
end $$;

create or replace function public.call_tick(p_call_id uuid, p_both_connected boolean)
returns public.call_sessions language plpgsql security definer set search_path = '' as $$
declare
  c public.call_sessions;
  v_now timestamptz := now();
  v_grace bigint := public.setting('call_grace_seconds');
  v_gap numeric;
  v_secs integer := 0;
  v_balance bigint;
  v_due bigint;
  v_delta bigint;
  v_host_due bigint;
  v_host_delta bigint;
  v_plat_delta bigint;
  v_out_of_funds boolean := false;
  v_key text;
begin
  select * into c from public.call_sessions where id = p_call_id for update;
  if not found then raise exception 'Unknown call.' using errcode = 'P0001'; end if;
  if c.status in ('ended', 'failed') then return c; end if;

  if not p_both_connected then
    if c.status = 'ringing' and v_now - c.created_at > make_interval(secs => public.setting('call_ring_timeout_seconds')) then
      update public.call_sessions set status = 'failed', end_reason = 'failed_to_connect', ended_at = v_now, last_tick_at = v_now
       where id = c.id returning * into c;
    elsif c.status = 'connected' and v_now - c.last_connected_at > make_interval(secs => v_grace) then
      update public.call_sessions set status = 'ended', end_reason = 'dropped', ended_at = v_now, last_tick_at = v_now
       where id = c.id returning * into c;
    else
      update public.call_sessions set last_tick_at = v_now where id = c.id returning * into c;
    end if;
    return c;
  end if;

  if c.status = 'ringing' then
    -- Billing starts now: nothing is charged for ringing time.
    update public.call_sessions set status = 'connected', connected_at = v_now, last_connected_at = v_now, last_tick_at = v_now
     where id = c.id returning * into c;
    return c;
  end if;

  v_gap := extract(epoch from (v_now - c.last_connected_at));
  if v_gap <= v_grace then
    v_secs := floor(v_gap)::integer;
  end if;

  if v_secs > 0 then
    v_due := floor(c.price_cents_per_minute::numeric * (c.billed_seconds + v_secs) / 60);
    v_delta := v_due - c.charged_cents;

    insert into public.wallets (user_id) values (c.customer_id) on conflict do nothing;
    -- Each call spends from its own pot: real balance for live calls, test balance for test calls.
    select case when c.livemode then balance_cents else test_balance_cents end into v_balance from public.wallets where user_id = c.customer_id for update;
    if v_delta >= v_balance then
      v_delta := v_balance;     -- take what's left, then end the call
      v_out_of_funds := true;
    end if;

    if v_delta > 0 then
      v_key := 'call:' || c.id || ':' || (c.billed_seconds + v_secs);
      perform public.wallet_apply(c.customer_id, 'call_charge', -v_delta, c.id, v_key, c.livemode, 'Call charge');
      -- Host share is computed on the running total so cents never drift.
      v_host_due := floor((c.charged_cents + v_delta)::numeric * (10000 - c.commission_bps) / 10000);
      v_host_delta := v_host_due - c.host_earnings_cents;
      v_plat_delta := v_delta - v_host_delta;
      insert into public.call_billing_records (call_id, seconds, amount_cents, host_cents, platform_cents, idempotency_key)
      values (c.id, v_secs, v_delta, v_host_delta, v_plat_delta, v_key);
      if v_host_delta > 0 then
        insert into public.host_earnings (host_id, kind, amount_cents, call_id, available_at, livemode, idempotency_key)
        values (c.host_id, 'call', v_host_delta, c.id, v_now + make_interval(days => public.setting('earnings_hold_days')::int), c.livemode, v_key);
      end if;
      if v_plat_delta > 0 then
        insert into public.platform_commissions (call_id, amount_cents, livemode, idempotency_key) values (c.id, v_plat_delta, c.livemode, v_key);
      end if;
    end if;

    update public.call_sessions set
      billed_seconds = billed_seconds + v_secs,
      charged_cents = charged_cents + greatest(v_delta, 0),
      host_earnings_cents = host_earnings_cents + greatest(coalesce(v_host_delta, 0), 0),
      platform_fee_cents = platform_fee_cents + greatest(coalesce(v_plat_delta, 0), 0),
      last_connected_at = last_connected_at + make_interval(secs => v_secs),
      last_tick_at = v_now,
      status = case when v_out_of_funds then 'ended'::public.call_status else status end,
      end_reason = case when v_out_of_funds then 'insufficient_funds' else end_reason end,
      ended_at = case when v_out_of_funds then v_now else ended_at end
    where id = c.id returning * into c;
  elsif v_gap > v_grace then
    -- Came back after an outage longer than the grace period: restart the clock, don't bill the gap.
    update public.call_sessions set last_connected_at = v_now, last_tick_at = v_now where id = c.id returning * into c;
  else
    update public.call_sessions set last_tick_at = v_now where id = c.id returning * into c;
  end if;
  return c;
end $$;

-- Earnings summary: "available" and "pending" are real money only; test earnings shown apart.
create or replace view public.my_host_earnings_summary as
select hp.id as host_id,
       coalesce(sum(e.amount_cents) filter (where e.kind = 'call'), 0)                         as total_earned_cents,
       coalesce(sum(e.amount_cents) filter (where e.livemode and e.available_at <= now()), 0)  as available_cents,
       coalesce(sum(e.amount_cents) filter (where e.livemode and e.available_at > now()), 0)   as pending_cents,
       (select count(*) from public.call_sessions cs where cs.host_id = hp.id and cs.billed_seconds > 0)  as calls_count,
       (select coalesce(sum(cs.billed_seconds), 0) from public.call_sessions cs where cs.host_id = hp.id) as billed_seconds,
       coalesce(sum(e.amount_cents) filter (where not e.livemode and e.kind = 'call'), 0)       as test_earned_cents
from public.host_profiles hp
left join public.host_earnings e on e.host_id = hp.id
where hp.user_id = auth.uid()
group by hp.id;

revoke all on public.my_host_earnings_summary from anon, authenticated;
grant select on public.my_host_earnings_summary to authenticated;

notify pgrst, 'reload schema';

-- ===================== 20261116100000_host_payouts.sql =====================
-- =====================================================================
-- HUMI · Host withdrawals (saque)
--   * Hosts save a Pix key and request a withdrawal.
--   * Only earnings from calls paid with REAL money, after the holding period, can be withdrawn.
--     Wallet money (top-ups) is never withdrawable: it isn't host earnings at all.
--   * A request immediately reserves the amount (negative 'payout' entry), so it can't be
--     requested twice. The HUMI team pays by Pix and marks it paid; failed/canceled → amount returns.
-- Safe to run more than once.
-- =====================================================================

alter table public.payout_accounts add column if not exists pix_key_type text;
alter table public.payout_accounts drop constraint if exists payout_accounts_pix_key_type_check;
alter table public.payout_accounts add constraint payout_accounts_pix_key_type_check
  check (pix_key_type is null or pix_key_type in ('cpf', 'cnpj', 'email', 'phone', 'random'));

insert into public.platform_settings (key, value, description) values
  ('payout_min_cents', 1000, 'Minimum withdrawal (cents).')
on conflict (key) do nothing;

-- Real, already-available call earnings minus reserved/paid withdrawals.
create or replace function public.host_available_cents(p_host_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_cents), 0)
  from public.host_earnings
  where host_id = p_host_id and livemode and available_at <= now();
$$;

-- Host saves where to receive (Pix key). Validated loosely; the team checks before paying.
create or replace function public.set_payout_pix_key(p_key_type text, p_key text)
returns public.payout_accounts language plpgsql security definer set search_path = '' as $$
declare
  v_host uuid;
  v_key text := btrim(coalesce(p_key, ''));
  v public.payout_accounts;
begin
  select id into v_host from public.host_profiles where user_id = auth.uid();
  if v_host is null then raise exception 'Only hosts can set a payout key.' using errcode = '42501'; end if;
  if p_key_type not in ('cpf', 'cnpj', 'email', 'phone', 'random') then raise exception 'Choose the Pix key type.' using errcode = 'P0001'; end if;
  if char_length(v_key) < 5 or char_length(v_key) > 100 then raise exception 'Enter a valid Pix key.' using errcode = 'P0001'; end if;
  if p_key_type = 'email' and v_key !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid Pix key.' using errcode = 'P0001'; end if;
  if p_key_type in ('cpf', 'cnpj', 'phone') then
    v_key := regexp_replace(v_key, '[^0-9+]', '', 'g');
    if (p_key_type = 'cpf' and char_length(v_key) <> 11) or (p_key_type = 'cnpj' and char_length(v_key) <> 14) then
      raise exception 'Enter a valid Pix key.' using errcode = 'P0001';
    end if;
  end if;
  insert into public.payout_accounts (host_id, provider, provider_account_id, pix_key_type, status, updated_at)
  values (v_host, 'pix_manual', v_key, p_key_type, 'active', now())
  on conflict (host_id) do update set provider = 'pix_manual', provider_account_id = excluded.provider_account_id,
    pix_key_type = excluded.pix_key_type, status = 'active', updated_at = now()
  returning * into v;
  return v;
end $$;

-- Host asks to withdraw. Reserves the amount right away.
create or replace function public.request_payout(p_amount_cents bigint)
returns public.payout_records language plpgsql security definer set search_path = '' as $$
declare
  v_host uuid;
  v_acc public.payout_accounts;
  v_available bigint;
  v_min bigint := coalesce(public.setting('payout_min_cents'), 1000);
  v public.payout_records;
begin
  select id into v_host from public.host_profiles where user_id = auth.uid();
  if v_host is null then raise exception 'Only hosts can withdraw.' using errcode = '42501'; end if;
  -- One request at a time per host (also serialises concurrent clicks).
  perform 1 from public.host_profiles where id = v_host for update;
  select * into v_acc from public.payout_accounts where host_id = v_host;
  if v_acc.provider_account_id is null or v_acc.status <> 'active' then
    raise exception 'Add your Pix key first.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payout_records where host_id = v_host and status in ('requested', 'processing')) then
    raise exception 'You already have a withdrawal in progress.' using errcode = 'P0001';
  end if;
  if p_amount_cents is null or p_amount_cents < v_min then
    raise exception 'The minimum withdrawal is % cents.', v_min using errcode = 'P0001';
  end if;
  v_available := public.host_available_cents(v_host);
  if p_amount_cents > v_available then
    raise exception 'You can withdraw up to % cents right now.', v_available using errcode = 'P0001';
  end if;

  insert into public.payout_records (host_id, amount_cents, status, provider, provider_payout_id, livemode)
  values (v_host, p_amount_cents, 'requested', 'pix_manual', v_acc.pix_key_type || ':' || v_acc.provider_account_id, true)
  returning * into v;
  insert into public.host_earnings (host_id, kind, amount_cents, payout_id, available_at, livemode, idempotency_key)
  values (v_host, 'payout', -p_amount_cents, v.id, now(), true, 'payout:' || v.id);
  return v;
end $$;

-- Gives a reserved amount back (failed/canceled withdrawal). Internal helper.
create or replace function public.payout_release(p_payout public.payout_records)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.host_earnings (host_id, kind, amount_cents, payout_id, available_at, livemode, idempotency_key)
  values (p_payout.host_id, 'adjustment', p_payout.amount_cents, p_payout.id, now(), true, 'payout-release:' || p_payout.id)
  on conflict (idempotency_key) do nothing;
end $$;

-- Host cancels their own request while the team hasn't started paying it.
create or replace function public.cancel_payout(p_payout_id uuid)
returns public.payout_records language plpgsql security definer set search_path = '' as $$
declare v public.payout_records;
begin
  select pr.* into v from public.payout_records pr
  join public.host_profiles hp on hp.id = pr.host_id
  where pr.id = p_payout_id and hp.user_id = auth.uid() for update of pr;
  if not found then raise exception 'Withdrawal not found.' using errcode = 'P0001'; end if;
  if v.status <> 'requested' then raise exception 'This withdrawal can no longer be canceled.' using errcode = 'P0001'; end if;
  update public.payout_records set status = 'canceled', updated_at = now() where id = v.id returning * into v;
  perform public.payout_release(v);
  return v;
end $$;

-- HUMI team (admin, or the SQL editor) moves a withdrawal along:
--   select public.admin_update_payout('<payout id>', 'paid');      -- after sending the Pix
--   select public.admin_update_payout('<payout id>', 'failed');    -- money goes back to the host
create or replace function public.admin_update_payout(p_payout_id uuid, p_status public.payout_status)
returns public.payout_records language plpgsql security definer set search_path = '' as $$
declare v public.payout_records;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Not allowed.' using errcode = '42501'; end if;
  select * into v from public.payout_records where id = p_payout_id for update;
  if not found then raise exception 'Withdrawal not found.' using errcode = 'P0001'; end if;
  if v.status in ('paid', 'failed', 'canceled') then raise exception 'This withdrawal is already %.', v.status using errcode = 'P0001'; end if;
  update public.payout_records set status = p_status, updated_at = now() where id = v.id returning * into v;
  if p_status in ('failed', 'canceled') then perform public.payout_release(v); end if;
  return v;
end $$;

-- What the team needs to pay: open requests with the host's Pix key.
create or replace view public.admin_payout_requests as
select pr.id, pr.created_at, pr.status, pr.amount_cents, hp.display_name, p.full_name,
       pa.pix_key_type, pa.provider_account_id as pix_key
from public.payout_records pr
join public.host_profiles hp on hp.id = pr.host_id
join public.profiles p on p.id = hp.user_id
left join public.payout_accounts pa on pa.host_id = pr.host_id
where public.is_admin() or auth.uid() is null
order by pr.created_at;

revoke all on public.admin_payout_requests from anon;
revoke execute on function public.host_available_cents(uuid), public.payout_release(public.payout_records) from public, anon, authenticated;
revoke execute on function public.set_payout_pix_key(text, text), public.request_payout(bigint), public.cancel_payout(uuid), public.admin_update_payout(uuid, public.payout_status) from public, anon;
grant execute on function public.set_payout_pix_key(text, text), public.request_payout(bigint), public.cancel_payout(uuid), public.admin_update_payout(uuid, public.payout_status) to authenticated;
-- Hosts never write payout tables directly.
revoke insert, update, delete on public.payout_accounts, public.payout_records from anon, authenticated;

notify pgrst, 'reload schema';

-- ===================== 20261116110000_online_default_price_range.sql =====================
-- =====================================================================
-- HUMI · "Online now" on by default + faster offline + price range R$ 1–5/min
--   * New hosts start with "Online now" switched ON (they can switch it off).
--   * Online = switch ON and a heartbeat in the last 90 s (was 3 min). The site also
--     tells the server right away when the host closes the tab.
--   * Price per minute limited to R$ 1,00 – R$ 5,00; prices outside are clamped.
-- Safe to run more than once.
-- =====================================================================

alter table public.host_profiles alter column is_available set default true;
-- Hosts who never touched the switch (everyone so far) get it ON.
update public.host_profiles set is_available = true where not is_available;

create or replace view public.public_hosts as
select
  hp.id, hp.display_name, hp.tagline, hp.description, hp.experience, hp.session_price, hp.hourly_rate,
  hp.categories, hp.call_types, hp.timezone, hp.is_available, hp.is_verified, hp.average_rating,
  hp.review_count, hp.total_sessions, hp.created_at,
  p.avatar_url, p.bio, p.country, p.city, p.languages, p.interests, p.is_sample,
  coalesce((
    select jsonb_agg(jsonb_build_object('day_of_week', a.day_of_week, 'start_time', a.start_time, 'end_time', a.end_time, 'timezone', a.timezone)
                     order by a.day_of_week, a.start_time)
    from public.host_availability a where a.host_id = hp.id
  ), '[]'::jsonb) as availability,
  p.region,
  coalesce(hp.is_available and hp.last_seen_at > now() - interval '90 seconds', false) as is_online,
  pr.audio_cents_per_minute,
  pr.video_cents_per_minute
from public.host_profiles hp
join public.profiles p on p.id = hp.user_id
left join public.host_pricing pr on pr.host_id = hp.id
where hp.is_published and p.role = 'host';

update public.platform_settings set value = 100 where key = 'price_min_cents_per_minute';
update public.platform_settings set value = 500 where key = 'price_max_cents_per_minute';

update public.host_pricing set
  audio_cents_per_minute = least(500, greatest(100, audio_cents_per_minute)),
  video_cents_per_minute = case when video_cents_per_minute is null then null else least(500, greatest(100, video_cents_per_minute)) end
where audio_cents_per_minute not between 100 and 500
   or (video_cents_per_minute is not null and video_cents_per_minute not between 100 and 500);

notify pgrst, 'reload schema';

-- ===================== 20261116120000_admin.sql =====================
-- =====================================================================
-- HUMI · Admin (platform administrators)
--   * Admin is a PERMISSION, separate from the account type: a host stays a host
--     (and stays listed in Explore) when they become an admin.
--   * Every admin function checks is_admin() in the database. The SQL editor
--     (no signed-in user) can call them too.
--   * Making someone admin the first time (run in the SQL editor):
--       insert into public.platform_admins (user_id)
--       select id from auth.users where email = 'PERSON@EMAIL' on conflict do nothing;
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

-- Admin = in platform_admins (or the legacy 'admin' account role).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
      or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- The site asks "am I an admin?" to show the admin area.
create or replace function public.am_i_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin();
$$;

-- Internal guard: signed-in admins, or the SQL editor (no signed-in user).
create or replace function public.assert_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
end $$;

-- Who did what (every admin action is logged).
create table if not exists public.admin_actions (
  id          bigint generated always as identity primary key,
  admin_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  target      text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon, authenticated;

create or replace function public.admin_log(p_action text, p_target text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_actions (admin_id, action, target, details) values (auth.uid(), p_action, p_target, coalesce(p_details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------
-- Overview numbers
-- ---------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'users',            (select count(*) from public.profiles),
    'hosts',            (select count(*) from public.host_profiles),
    'hosts_published',  (select count(*) from public.host_profiles where is_published),
    'hosts_online',     (select count(*) from public.host_profiles where is_available and last_seen_at > now() - interval '90 seconds'),
    'calls_total',      (select count(*) from public.call_sessions where billed_seconds > 0),
    'calls_today',      (select count(*) from public.call_sessions where billed_seconds > 0 and created_at >= date_trunc('day', now())),
    'calls_live_now',   (select count(*) from public.call_sessions where status in ('ringing', 'connected')),
    'minutes_total',    (select coalesce(sum(billed_seconds), 0) / 60 from public.call_sessions),
    'revenue_cents',    (select coalesce(sum(charged_cents), 0) from public.call_sessions where livemode),
    'commission_cents', (select coalesce(sum(amount_cents), 0) from public.platform_commissions where livemode),
    'topups_cents',     (select coalesce(sum(amount_cents), 0) from public.wallet_topups where livemode and status = 'approved'),
    'wallets_cents',    (select coalesce(sum(balance_cents), 0) from public.wallets),
    'host_owed_cents',  (select coalesce(sum(amount_cents), 0) from public.host_earnings where livemode),
    'payouts_open',     (select count(*) from public.payout_records where status in ('requested', 'processing')),
    'payouts_open_cents', (select coalesce(sum(amount_cents), 0) from public.payout_records where status in ('requested', 'processing')),
    'reports_open',     (select count(*) from public.user_reports where status in ('open', 'reviewing'))
  );
end $$;

-- ---------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------
create or replace function public.admin_list_users(p_search text default null, p_limit integer default 50)
returns table (
  id uuid, email text, full_name text, role public.user_role, created_at timestamptz, country text,
  avatar_url text, is_admin boolean, banned boolean, host_id uuid, host_published boolean,
  balance_cents bigint, test_balance_cents bigint, host_available_cents bigint, reports_against bigint
) language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform public.assert_admin();
  return query
  select p.id, u.email::text, p.full_name, p.role, p.created_at, p.country, p.avatar_url,
         exists (select 1 from public.platform_admins a where a.user_id = p.id) or p.role = 'admin',
         coalesce(u.banned_until > now(), false),
         hp.id, hp.is_published,
         coalesce(w.balance_cents, 0), coalesce(w.test_balance_cents, 0),
         case when hp.id is null then 0 else public.host_available_cents(hp.id) end,
         (select count(*) from public.user_reports r where r.reported_user_id = p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.host_profiles hp on hp.user_id = p.id
  left join public.wallets w on w.user_id = p.id
  where v_q is null or p.full_name ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%' or p.id::text = v_q
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

create or replace function public.admin_set_admin(p_user_id uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  if p_admin then
    insert into public.platform_admins (user_id, created_by) values (p_user_id, auth.uid()) on conflict do nothing;
  else
    if p_user_id = auth.uid() then raise exception 'You can''t remove your own admin access.' using errcode = 'P0001'; end if;
    delete from public.platform_admins where user_id = p_user_id;
  end if;
  perform public.admin_log(case when p_admin then 'grant_admin' else 'revoke_admin' end, p_user_id::text);
end $$;

create or replace function public.admin_set_host_published(p_host_id uuid, p_published boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  update public.host_profiles set is_published = p_published, updated_at = now() where id = p_host_id;
  if not found then raise exception 'Host not found.' using errcode = 'P0001'; end if;
  perform public.admin_log(case when p_published then 'show_host' else 'hide_host' end, p_host_id::text);
end $$;

-- Wallet credit / debit (e.g. refund). Real money unless p_test.
create or replace function public.admin_adjust_wallet(p_user_id uuid, p_amount_cents bigint, p_reason text, p_test boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_balance bigint; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.assert_admin();
  if p_amount_cents is null or p_amount_cents = 0 or abs(p_amount_cents) > 1000000 then
    raise exception 'Enter an amount between R$ 0,01 and R$ 10.000,00.' using errcode = 'P0001';
  end if;
  if v_reason is null then raise exception 'Write a reason.' using errcode = 'P0001'; end if;
  v_balance := public.wallet_apply(p_user_id, 'adjustment', p_amount_cents, null,
                                   'admin-wallet:' || gen_random_uuid(), not coalesce(p_test, false), 'Adjustment: ' || left(v_reason, 120));
  perform public.admin_log('wallet_adjustment', p_user_id::text, jsonb_build_object('amount_cents', p_amount_cents, 'reason', v_reason, 'test', coalesce(p_test, false)));
  return v_balance;
end $$;

-- Host earnings adjustment (available for withdrawal right away). Negative values remove.
create or replace function public.admin_adjust_earnings(p_host_id uuid, p_amount_cents bigint, p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.assert_admin();
  if p_amount_cents is null or p_amount_cents = 0 or abs(p_amount_cents) > 1000000 then
    raise exception 'Enter an amount between R$ 0,01 and R$ 10.000,00.' using errcode = 'P0001';
  end if;
  if v_reason is null then raise exception 'Write a reason.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.host_profiles where id = p_host_id) then raise exception 'Host not found.' using errcode = 'P0001'; end if;
  if p_amount_cents < 0 and public.host_available_cents(p_host_id) + p_amount_cents < 0 then
    raise exception 'That would make the host''s available balance negative.' using errcode = 'P0001';
  end if;
  insert into public.host_earnings (host_id, kind, amount_cents, available_at, livemode, idempotency_key)
  values (p_host_id, 'adjustment', p_amount_cents, now(), true, 'admin-earnings:' || gen_random_uuid());
  perform public.admin_log('earnings_adjustment', p_host_id::text, jsonb_build_object('amount_cents', p_amount_cents, 'reason', v_reason));
  return public.host_available_cents(p_host_id);
end $$;

-- ---------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------
alter table public.user_reports add column if not exists admin_note text check (char_length(admin_note) <= 1000);

create or replace function public.admin_list_reports(p_status text default null)
returns table (
  id uuid, created_at timestamptz, status public.report_status, reason public.report_reason, context text, details text, admin_note text,
  reporter_id uuid, reporter_name text, reported_user_id uuid, reported_name text, reported_email text, call_id uuid
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
  select r.id, r.created_at, r.status, r.reason, r.context, r.details, r.admin_note,
         r.reporter_id, rp.full_name, r.reported_user_id, tp.full_name, tu.email::text, r.call_id
  from public.user_reports r
  join public.profiles rp on rp.id = r.reporter_id
  join public.profiles tp on tp.id = r.reported_user_id
  join auth.users tu on tu.id = r.reported_user_id
  where p_status is null or r.status::text = p_status
  order by (r.status in ('open', 'reviewing')) desc, r.created_at desc
  limit 200;
end $$;

create or replace function public.admin_update_report(p_report_id uuid, p_status public.report_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  update public.user_reports set status = p_status, admin_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), admin_note), updated_at = now()
  where id = p_report_id;
  if not found then raise exception 'Report not found.' using errcode = 'P0001'; end if;
  perform public.admin_log('report_' || p_status::text, p_report_id::text, jsonb_build_object('note', p_note));
end $$;

-- ---------------------------------------------------------------------
-- Calls, top-ups, payouts (read)
-- ---------------------------------------------------------------------
create or replace function public.admin_list_calls(p_limit integer default 100)
returns table (
  id uuid, created_at timestamptz, status public.call_status, call_type public.call_type, livemode boolean,
  customer_name text, host_name text, billed_seconds integer, charged_cents bigint, host_earnings_cents bigint,
  platform_fee_cents bigint, end_reason text
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
  select cs.id, cs.created_at, cs.status, cs.call_type, cs.livemode, cp.full_name, hp.display_name,
         cs.billed_seconds, cs.charged_cents, cs.host_earnings_cents, cs.platform_fee_cents, cs.end_reason
  from public.call_sessions cs
  join public.profiles cp on cp.id = cs.customer_id
  join public.host_profiles hp on hp.id = cs.host_id
  order by cs.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

create or replace function public.admin_list_topups(p_limit integer default 100)
returns table (
  id uuid, created_at timestamptz, status public.topup_status, amount_cents bigint, method text, provider text,
  livemode boolean, user_name text, user_email text, provider_payment_id text
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
  select t.id, t.created_at, t.status, t.amount_cents, t.method, t.provider, t.livemode, p.full_name, u.email::text, t.provider_payment_id
  from public.wallet_topups t
  join public.profiles p on p.id = t.user_id
  join auth.users u on u.id = t.user_id
  order by t.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

create or replace function public.admin_list_payouts()
returns table (
  id uuid, created_at timestamptz, updated_at timestamptz, status public.payout_status, amount_cents bigint,
  host_id uuid, display_name text, full_name text, email text, pix_key_type text, pix_key text
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
  select pr.id, pr.created_at, pr.updated_at, pr.status, pr.amount_cents, pr.host_id, hp.display_name, p.full_name, u.email::text,
         pa.pix_key_type, pa.provider_account_id
  from public.payout_records pr
  join public.host_profiles hp on hp.id = pr.host_id
  join public.profiles p on p.id = hp.user_id
  join auth.users u on u.id = hp.user_id
  left join public.payout_accounts pa on pa.host_id = pr.host_id
  order by (pr.status in ('requested', 'processing')) desc, pr.created_at desc
  limit 300;
end $$;

-- Payout status changes by admins are logged too.
create or replace function public.admin_update_payout(p_payout_id uuid, p_status public.payout_status)
returns public.payout_records language plpgsql security definer set search_path = '' as $$
declare v public.payout_records;
begin
  perform public.assert_admin();
  select * into v from public.payout_records where id = p_payout_id for update;
  if not found then raise exception 'Withdrawal not found.' using errcode = 'P0001'; end if;
  if v.status in ('paid', 'failed', 'canceled') then raise exception 'This withdrawal is already %.', v.status using errcode = 'P0001'; end if;
  update public.payout_records set status = p_status, updated_at = now() where id = v.id returning * into v;
  if p_status in ('failed', 'canceled') then perform public.payout_release(v); end if;
  perform public.admin_log('payout_' || p_status::text, p_payout_id::text, jsonb_build_object('amount_cents', v.amount_cents));
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
create or replace function public.admin_list_settings()
returns table (key text, value bigint, description text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query select s.key, s.value, s.description, s.updated_at from public.platform_settings s
  where s.key not in ('wallet_split_done') order by s.key;
end $$;

create or replace function public.admin_set_setting(p_key text, p_value bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old bigint;
begin
  perform public.assert_admin();
  -- Only known settings, each within sane limits.
  if not (
       (p_key = 'commission_bps'             and p_value between 0 and 9000)
    or (p_key = 'price_min_cents_per_minute' and p_value between 10 and 100000)
    or (p_key = 'price_max_cents_per_minute' and p_value between 10 and 100000)
    or (p_key = 'topup_min_cents'            and p_value between 100 and 10000000)
    or (p_key = 'topup_max_cents'            and p_value between 100 and 10000000)
    or (p_key = 'call_min_start_seconds'     and p_value between 0 and 3600)
    or (p_key = 'call_grace_seconds'         and p_value between 10 and 600)
    or (p_key = 'call_ring_timeout_seconds'  and p_value between 15 and 600)
    or (p_key = 'earnings_hold_days'         and p_value between 0 and 90)
    or (p_key = 'payout_min_cents'           and p_value between 1 and 10000000)
    or (p_key = 'allow_test_calls'           and p_value in (0, 1))
  ) then
    raise exception 'Invalid value for this setting.' using errcode = 'P0001';
  end if;
  if p_key = 'price_min_cents_per_minute' and p_value > public.setting('price_max_cents_per_minute') then
    raise exception 'The minimum price can''t be above the maximum.' using errcode = 'P0001';
  end if;
  if p_key = 'price_max_cents_per_minute' and p_value < public.setting('price_min_cents_per_minute') then
    raise exception 'The maximum price can''t be below the minimum.' using errcode = 'P0001';
  end if;
  select value into v_old from public.platform_settings where key = p_key;
  if not found then raise exception 'Unknown setting.' using errcode = 'P0001'; end if;
  update public.platform_settings set value = p_value, updated_at = now() where key = p_key;
  perform public.admin_log('setting', p_key, jsonb_build_object('from', v_old, 'to', p_value));
end $$;

create or replace function public.admin_list_actions(p_limit integer default 100)
returns table (id bigint, created_at timestamptz, admin_name text, action text, target text, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query
  select a.id, a.created_at, p.full_name, a.action, a.target, a.details
  from public.admin_actions a left join public.profiles p on p.id = a.admin_id
  order by a.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

-- ---------------------------------------------------------------------
-- Privileges: helpers are internal; admin functions callable by signed-in users
-- (each one checks is_admin itself).
-- ---------------------------------------------------------------------
revoke execute on function public.assert_admin(), public.admin_log(text, text, jsonb) from public, anon, authenticated;
revoke execute on function
  public.am_i_admin(), public.admin_overview(), public.admin_list_users(text, integer), public.admin_set_admin(uuid, boolean),
  public.admin_set_host_published(uuid, boolean), public.admin_adjust_wallet(uuid, bigint, text, boolean),
  public.admin_adjust_earnings(uuid, bigint, text), public.admin_list_reports(text), public.admin_update_report(uuid, public.report_status, text),
  public.admin_list_calls(integer), public.admin_list_topups(integer), public.admin_list_payouts(),
  public.admin_update_payout(uuid, public.payout_status), public.admin_list_settings(), public.admin_set_setting(text, bigint),
  public.admin_list_actions(integer)
from public, anon;
grant execute on function
  public.am_i_admin(), public.admin_overview(), public.admin_list_users(text, integer), public.admin_set_admin(uuid, boolean),
  public.admin_set_host_published(uuid, boolean), public.admin_adjust_wallet(uuid, bigint, text, boolean),
  public.admin_adjust_earnings(uuid, bigint, text), public.admin_list_reports(text), public.admin_update_report(uuid, public.report_status, text),
  public.admin_list_calls(integer), public.admin_list_topups(integer), public.admin_list_payouts(),
  public.admin_update_payout(uuid, public.payout_status), public.admin_list_settings(), public.admin_set_setting(text, bigint),
  public.admin_list_actions(integer)
to authenticated;

notify pgrst, 'reload schema';

-- ===================== 20261116130000_price_min_30.sql =====================
-- =====================================================================
-- HUMI · Minimum price per minute R$ 0,30 (maximum stays R$ 5,00).
-- Safe to run more than once.
-- =====================================================================
update public.platform_settings set value = 30, updated_at = now() where key = 'price_min_cents_per_minute';
notify pgrst, 'reload schema';

-- ===================== 20261116140000_growth.sql =====================
-- =====================================================================
-- HUMI · Growth: first top-up bonus, referrals and signup source
--   * First real top-up of at least first_topup_bonus_min_cents earns first_topup_bonus_cents
--     of call credit (once per person). Set the bonus to 0 to switch it off.
--   * Referrals: everyone has a code (humi.chat/?ref=CODE). When an invited person makes their
--     first top-up, the person who invited them gets referral_bonus_cents of call credit.
--   * Bonuses are call credit: they can't be withdrawn and are taken back if the top-up that
--     triggered them is refunded.
--   * signup_source keeps where each account came from (utm_source, campaign…) for marketing.
-- Safe to run more than once.
-- =====================================================================

alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references public.profiles (id) on delete set null;
alter table public.profiles add column if not exists signup_source jsonb;
create unique index if not exists profiles_referral_code_key on public.profiles (referral_code);

insert into public.platform_settings (key, value, description) values
  ('first_topup_bonus_cents',     500,  'Bonus credit on a person''s first top-up (cents). 0 = off.'),
  ('first_topup_bonus_min_cents', 2000, 'Minimum first top-up to earn the bonus (cents).'),
  ('referral_bonus_cents',        500,  'Credit for the person who invited someone, when that person makes their first top-up (cents). 0 = off.')
on conflict (key) do nothing;

-- Short, unambiguous referral codes (no 0/O/1/I).
create or replace function public.new_referral_code()
returns text language plpgsql volatile set search_path = '' as $fn$
declare v text; abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  loop
    v := '';
    for i in 1..7 loop
      v := v || substr(abc, 1 + floor(random() * length(abc))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = v);
  end loop;
  return v;
end $fn$;

create or replace function public.profiles_set_referral_code()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  if new.referral_code is null then new.referral_code := public.new_referral_code(); end if;
  return new;
end $fn$;
drop trigger if exists profiles_referral_code on public.profiles;
create trigger profiles_referral_code before insert on public.profiles for each row execute function public.profiles_set_referral_code();
update public.profiles set referral_code = public.new_referral_code() where referral_code is null;

-- Called once by the site right after sign-up: stores where the person came from and who invited them.
create or replace function public.set_signup_source(p_source jsonb default null, p_ref text default null)
returns void language plpgsql security definer set search_path = '' as $fn$
declare v_me public.profiles; v_ref uuid;
begin
  select * into v_me from public.profiles where id = auth.uid() for update;
  if not found then return; end if;
  -- Only for new accounts, and only once.
  if v_me.created_at < now() - interval '2 days' then return; end if;
  if v_me.signup_source is null and p_source is not null and jsonb_typeof(p_source) = 'object' and length(p_source::text) <= 2000 then
    update public.profiles set signup_source = p_source where id = v_me.id;
  end if;
  if v_me.referred_by is null and nullif(btrim(coalesce(p_ref, '')), '') is not null then
    select id into v_ref from public.profiles where referral_code = upper(btrim(p_ref));
    if v_ref is not null and v_ref <> v_me.id then
      update public.profiles set referred_by = v_ref where id = v_me.id;
    end if;
  end if;
end $fn$;

-- First top-up bonus and referral reward (internal; called by confirm_topup).
create or replace function public.apply_topup_promos(p public.wallet_topups)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_bonus bigint := coalesce(public.setting('first_topup_bonus_cents'), 0);
  v_min bigint := coalesce(public.setting('first_topup_bonus_min_cents'), 0);
  v_ref_bonus bigint := coalesce(public.setting('referral_bonus_cents'), 0);
  v_referrer uuid;
  v_mode text := case when p.livemode then 'live' else 'test' end;
begin
  -- Only the person's FIRST approved top-up (in this mode) counts.
  if exists (select 1 from public.wallet_topups t where t.user_id = p.user_id and t.livemode = p.livemode and t.status in ('approved', 'refunded') and t.id <> p.id) then
    return;
  end if;
  if p.amount_cents < v_min then return; end if;
  if v_bonus > 0 then
    perform public.wallet_apply(p.user_id, 'adjustment', v_bonus, p.id, 'bonus-first:' || p.user_id || ':' || v_mode, p.livemode, 'Welcome bonus');
  end if;
  select referred_by into v_referrer from public.profiles where id = p.user_id;
  if v_referrer is not null and v_ref_bonus > 0 then
    perform public.wallet_apply(v_referrer, 'adjustment', v_ref_bonus, p.id, 'bonus-ref:' || p.user_id || ':' || v_mode, p.livemode, 'Referral bonus');
  end if;
end $fn$;

-- On refund: take the bonuses back (best effort for the referrer: only what they still have).
create or replace function public.reverse_topup_promos(p public.wallet_topups)
returns void language plpgsql security definer set search_path = '' as $fn$
declare r record;
begin
  for r in
    select user_id, amount_cents, idempotency_key from public.wallet_transactions
    where reference_id = p.id and kind = 'adjustment' and amount_cents > 0
      and (idempotency_key like 'bonus-first:%' or idempotency_key like 'bonus-ref:%')
  loop
    begin
      perform public.wallet_apply(r.user_id, 'adjustment', -r.amount_cents, p.id, r.idempotency_key || ':reversed', p.livemode, 'Bonus reversed (refund)');
    exception when others then
      null; -- already spent: kept as a promotional cost
    end;
  end loop;
end $fn$;

create or replace function public.confirm_topup(p_topup_id uuid, p_provider text, p_provider_payment_id text, p_amount_cents bigint, p_status public.topup_status, p_method text default null, p_reason text default null)
returns public.wallet_topups language plpgsql security definer set search_path = '' as $$
declare v public.wallet_topups;
begin
  select * into v from public.wallet_topups where id = p_topup_id for update;
  if not found or v.provider <> p_provider then raise exception 'Unknown top-up.' using errcode = 'P0001'; end if;
  if p_status = 'approved' then
    if v.status = 'approved' then return v; end if;                 -- repeated webhook: no-op
    if v.status <> 'pending' then raise exception 'Top-up is %.', v.status using errcode = 'P0001'; end if;
    if p_amount_cents <> v.amount_cents then raise exception 'Amount mismatch.' using errcode = 'P0001', hint = 'amount_mismatch'; end if;
    update public.wallet_topups set status = 'approved', provider_payment_id = p_provider_payment_id, method = coalesce(p_method, method),
           confirmed_at = now(), updated_at = now() where id = v.id returning * into v;
    perform public.wallet_apply(v.user_id, 'topup', v.amount_cents, v.id, 'topup:' || v.id, v.livemode,
                                'Top-up' || case when v.livemode then '' else ' (test)' end);
    perform public.apply_topup_promos(v);
  elsif p_status in ('declined', 'canceled') then
    if v.status = 'pending' then
      update public.wallet_topups set status = p_status, provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
             failure_reason = p_reason, updated_at = now() where id = v.id returning * into v;
    end if;
  elsif p_status = 'refunded' then
    if v.status = 'approved' then
      -- Remove the credit (fails if already spent; such cases need manual review).
      perform public.reverse_topup_promos(v);
      perform public.wallet_apply(v.user_id, 'refund', -v.amount_cents, v.id, 'topup-refund:' || v.id, v.livemode, 'Top-up refunded');
      update public.wallet_topups set status = 'refunded', updated_at = now() where id = v.id returning * into v;
    end if;
  end if;
  return v;
end $$;

-- Your invite link data: code, how many signed up with it and how much credit it earned you.
create or replace function public.my_referral()
returns table (referral_code text, invited integer, rewarded_cents bigint)
language sql stable security definer set search_path = '' as $fn$
  select p.referral_code,
         (select count(*)::int from public.profiles x where x.referred_by = p.id),
         (select coalesce(sum(t.amount_cents), 0) from public.wallet_transactions t
           where t.user_id = p.id and t.livemode and t.idempotency_key like 'bonus-ref:%' and t.amount_cents > 0)
  from public.profiles p where p.id = auth.uid();
$fn$;

-- Public promo numbers for the site (bonus banner, invite page).
create or replace function public.promo_settings()
returns table (first_topup_bonus_cents bigint, first_topup_bonus_min_cents bigint, referral_bonus_cents bigint)
language sql stable security definer set search_path = '' as $fn$
  select public.setting('first_topup_bonus_cents'), public.setting('first_topup_bonus_min_cents'), public.setting('referral_bonus_cents');
$fn$;

-- Has the signed-in person already made a (real) top-up? Drives the "first top-up bonus" banner.
create or replace function public.my_first_topup_done()
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.wallet_topups where user_id = auth.uid() and livemode and status in ('approved', 'refunded'));
$fn$;

-- Marketing: sign-ups and first top-ups per source (admins).
create or replace function public.admin_signup_sources(p_days integer default 30)
returns table (source text, campaign text, signups bigint, paying bigint)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform public.assert_admin();
  return query
  select coalesce(nullif(p.signup_source ->> 'utm_source', ''), case when p.referred_by is not null then 'referral' end, 'direct') as source,
         coalesce(p.signup_source ->> 'utm_campaign', '') as campaign,
         count(*) as signups,
         count(*) filter (where exists (select 1 from public.wallet_topups t where t.user_id = p.id and t.livemode and t.status = 'approved')) as paying
  from public.profiles p
  where p.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 30), 1))
  group by 1, 2
  order by 3 desc;
end $fn$;

create or replace function public.admin_set_setting(p_key text, p_value bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old bigint;
begin
  perform public.assert_admin();
  -- Only known settings, each within sane limits.
  if not (
       (p_key = 'commission_bps'             and p_value between 0 and 9000)
    or (p_key = 'price_min_cents_per_minute' and p_value between 10 and 100000)
    or (p_key = 'price_max_cents_per_minute' and p_value between 10 and 100000)
    or (p_key = 'topup_min_cents'            and p_value between 100 and 10000000)
    or (p_key = 'topup_max_cents'            and p_value between 100 and 10000000)
    or (p_key = 'call_min_start_seconds'     and p_value between 0 and 3600)
    or (p_key = 'call_grace_seconds'         and p_value between 10 and 600)
    or (p_key = 'call_ring_timeout_seconds'  and p_value between 15 and 600)
    or (p_key = 'earnings_hold_days'         and p_value between 0 and 90)
    or (p_key = 'payout_min_cents'           and p_value between 1 and 10000000)
    or (p_key = 'allow_test_calls'           and p_value in (0, 1))
    or (p_key = 'first_topup_bonus_cents'    and p_value between 0 and 100000)
    or (p_key = 'first_topup_bonus_min_cents' and p_value between 0 and 10000000)
    or (p_key = 'referral_bonus_cents'       and p_value between 0 and 100000)
  ) then
    raise exception 'Invalid value for this setting.' using errcode = 'P0001';
  end if;
  if p_key = 'price_min_cents_per_minute' and p_value > public.setting('price_max_cents_per_minute') then
    raise exception 'The minimum price can''t be above the maximum.' using errcode = 'P0001';
  end if;
  if p_key = 'price_max_cents_per_minute' and p_value < public.setting('price_min_cents_per_minute') then
    raise exception 'The maximum price can''t be below the minimum.' using errcode = 'P0001';
  end if;
  select value into v_old from public.platform_settings where key = p_key;
  if not found then raise exception 'Unknown setting.' using errcode = 'P0001'; end if;
  update public.platform_settings set value = p_value, updated_at = now() where key = p_key;
  perform public.admin_log('setting', p_key, jsonb_build_object('from', v_old, 'to', p_value));
end $$;

revoke execute on function public.new_referral_code(), public.apply_topup_promos(public.wallet_topups), public.reverse_topup_promos(public.wallet_topups) from public, anon, authenticated;
revoke execute on function public.set_signup_source(jsonb, text), public.my_referral(), public.my_first_topup_done(), public.admin_signup_sources(integer) from public, anon;
grant execute on function public.set_signup_source(jsonb, text), public.my_referral(), public.my_first_topup_done(), public.admin_signup_sources(integer) to authenticated;
revoke execute on function public.promo_settings() from public;
grant execute on function public.promo_settings() to anon, authenticated;

notify pgrst, 'reload schema';

-- ===================== 20261116150000_wallet_activity.sql =====================
-- =====================================================================
-- Wallet activity: one line per call.
-- Calls are billed every few seconds, so a 20-minute call writes hundreds
-- of ledger rows. The wallet page read the newest 100 raw rows, so long
-- calls pushed older calls and top-ups out of the list and showed only
-- part of the call's total. This view groups each call's charges into a
-- single row (total, final balance, end time). RLS of wallet_transactions
-- still applies (security_invoker).
-- =====================================================================

create or replace view public.my_wallet_activity with (security_invoker = true) as
select (array_agg(t.id order by t.created_at desc, t.id desc))[1]                  as id,
       t.user_id,
       'call_charge'::text                                                          as kind,
       sum(t.amount_cents)::bigint                                                  as amount_cents,
       (array_agg(t.balance_after_cents order by t.created_at desc, t.id desc))[1]  as balance_after_cents,
       t.reference_id,
       t.livemode,
       'Call charge'::text                                                          as description,
       max(t.created_at)                                                            as created_at
from public.wallet_transactions t
where t.kind = 'call_charge' and t.reference_id is not null
group by t.user_id, t.reference_id, t.livemode
union all
select t.id, t.user_id, t.kind::text, t.amount_cents, t.balance_after_cents, t.reference_id, t.livemode, t.description, t.created_at
from public.wallet_transactions t
where not (t.kind = 'call_charge' and t.reference_id is not null);

revoke all on public.my_wallet_activity from anon, authenticated;
grant select on public.my_wallet_activity to authenticated;

notify pgrst, 'reload schema';

-- ===================== 20261116160000_safety.sql =====================
-- =====================================================================
-- HUMI · Safety: block people, automatic suspension, limit on refused calls,
-- community rules before the first call.
--   * Block: either side can block the other (from a call, a booking or a host
--     profile — no user ids needed). Blocked people can't call, book or see
--     each other; future bookings between them are cancelled.
--   * Automatic suspension: when N different people (setting
--     auto_suspend_reports, default 3) report someone after a real call or
--     booking within 7 days, the account is suspended until an admin reviews it
--     (login blocked, host profile hidden). Admins are never auto-suspended.
--   * Refused calls: if a host declined your last N calls (setting
--     declined_call_limit, default 3) in the past 24 h, you can't call that host
--     until the oldest of those is 24 h old.
--   * Rules: the date someone accepted the community rules before their first
--     call is recorded.
-- Safe to run more than once.
-- =====================================================================

alter table public.profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text,
  add column if not exists call_rules_accepted_at timestamptz;

insert into public.platform_settings (key, value, description) values
  ('auto_suspend_reports', 3, 'Different people reporting someone (after a call or booking) within 7 days that suspends the account until review. 0 = off.'),
  ('declined_call_limit',  3, 'Calls in a row a host can decline before the caller must wait 24 h to call that host again. 0 = off.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------
create table if not exists public.user_blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);
alter table public.user_blocks enable row level security;
drop policy if exists "blocks: own" on public.user_blocks;
create policy "blocks: own" on public.user_blocks for select to authenticated using (blocker_id = auth.uid() or public.is_admin());
revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;

create or replace function public.users_blocked(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_a is not null and p_b is not null and exists (
    select 1 from public.user_blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  )
$$;

create or replace function public.declined_too_often(p_customer uuid, p_host uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_limit integer := coalesce(public.setting('declined_call_limit'), 0); v_n integer; v_all boolean;
begin
  if v_limit <= 0 then return false; end if;
  select count(*), coalesce(bool_and(end_reason = 'declined'), false) into v_n, v_all
  from (select end_reason from public.call_sessions
        where customer_id = p_customer and host_id = p_host and created_at > now() - interval '24 hours'
        order by created_at desc limit v_limit) last_calls;
  return v_n >= v_limit and v_all;
end $$;

/** The other person in a call / booking, or the owner of a host profile. Same rules as reports. */
create or replace function public.other_party(p_call_id uuid, p_booking_id uuid, p_host_id uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_customer uuid; v_host_user uuid;
begin
  if v_uid is null then raise exception 'Please log in.' using errcode = '42501'; end if;
  if (p_call_id is not null)::int + (p_booking_id is not null)::int + (p_host_id is not null)::int <> 1 then
    raise exception 'Choose one call, booking or profile.' using errcode = 'P0001';
  end if;
  if p_call_id is not null then
    select cs.customer_id, hp.user_id into v_customer, v_host_user
    from public.call_sessions cs join public.host_profiles hp on hp.id = cs.host_id where cs.id = p_call_id;
  elsif p_booking_id is not null then
    select b.customer_id, hp.user_id into v_customer, v_host_user
    from public.bookings b join public.host_profiles hp on hp.id = b.host_id where b.id = p_booking_id;
  else
    select hp.user_id into v_host_user from public.host_profiles hp where hp.id = p_host_id;
    if v_host_user is null then raise exception 'Not found.' using errcode = 'P0001'; end if;
    if v_host_user = v_uid then raise exception 'You can''t block yourself.' using errcode = 'P0001'; end if;
    return v_host_user;
  end if;
  if v_host_user is null then raise exception 'Not found.' using errcode = 'P0001'; end if;
  if v_uid = v_customer then return v_host_user; end if;
  if v_uid = v_host_user then return v_customer; end if;
  raise exception 'You can only block people you talked to.' using errcode = '42501';
end $$;

create or replace function public.block_user(p_call_id uuid default null, p_booking_id uuid default null, p_host_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_target uuid;
begin
  v_target := public.other_party(p_call_id, p_booking_id, p_host_id);
  insert into public.user_blocks (blocker_id, blocked_id) values (v_uid, v_target) on conflict do nothing;
  -- Future sessions between the two are cancelled.
  update public.bookings b set status = 'cancelled', cancelled_by = v_uid
   where b.status in ('pending', 'confirmed') and b.scheduled_at > now()
     and ((b.customer_id = v_uid and b.host_id in (select id from public.host_profiles where user_id = v_target))
       or (b.customer_id = v_target and b.host_id in (select id from public.host_profiles where user_id = v_uid)));
  -- A call that is still ringing between them stops ringing.
  update public.call_sessions cs set status = 'failed', end_reason = 'declined', ended_at = now()
   where cs.status = 'ringing'
     and ((cs.customer_id = v_uid and cs.host_id in (select id from public.host_profiles where user_id = v_target))
       or (cs.customer_id = v_target and cs.host_id in (select id from public.host_profiles where user_id = v_uid)));
end $$;

create or replace function public.unblock_user(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_user;
$$;

create or replace function public.my_blocks()
returns table (user_id uuid, name text, avatar_url text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select ub.blocked_id,
         coalesce(nullif((select hp.display_name from public.host_profiles hp where hp.user_id = ub.blocked_id limit 1), ''), nullif(split_part(p.full_name, ' ', 1), ''), 'HUMI user'),
         p.avatar_url, ub.created_at
  from public.user_blocks ub join public.profiles p on p.id = ub.blocked_id
  where ub.blocker_id = auth.uid()
  order by ub.created_at desc
$$;

-- ---------------------------------------------------------------------
-- Community rules before the first call
-- ---------------------------------------------------------------------
create or replace function public.accept_call_rules()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set call_rules_accepted_at = coalesce(call_rules_accepted_at, now()) where id = auth.uid();
$$;

create or replace function public.call_rules_accepted()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select call_rules_accepted_at is not null from public.profiles where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------------
-- Automatic suspension after reports from different people
-- ---------------------------------------------------------------------
create or replace function public.suspend_user(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set suspended_at = coalesce(suspended_at, now()), suspended_reason = coalesce(suspended_reason, p_reason) where id = p_user;
  update public.host_profiles set is_published = false, is_available = false where user_id = p_user;
  -- Also block the login (Supabase Auth). Ignored where auth.users isn't writable.
  begin
    update auth.users set banned_until = now() + interval '100 years' where id = p_user;
  exception when others then null;
  end;
end $$;

create or replace function public.user_reports_auto_suspend()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_limit integer := coalesce(public.setting('auto_suspend_reports'), 0); v_n integer;
begin
  if v_limit <= 0 or new.context not in ('call', 'booking') then return new; end if;
  if exists (select 1 from public.platform_admins where user_id = new.reported_user_id) then return new; end if;
  if exists (select 1 from public.profiles where id = new.reported_user_id and suspended_at is not null) then return new; end if;
  select count(distinct reporter_id) into v_n from public.user_reports
   where reported_user_id = new.reported_user_id and context in ('call', 'booking')
     and status <> 'dismissed' and created_at > now() - interval '7 days';
  if v_n >= v_limit then
    perform public.suspend_user(new.reported_user_id, 'reports');
    insert into public.admin_actions (admin_id, action, target, details)
    values (null, 'auto_suspend', new.reported_user_id::text, jsonb_build_object('reports', v_n, 'days', 7));
  end if;
  return new;
end $$;

drop trigger if exists user_reports_auto_suspend on public.user_reports;
create trigger user_reports_auto_suspend after insert on public.user_reports
  for each row execute function public.user_reports_auto_suspend();

/** Admin: lift a suspension (the login is unblocked by the admin API route). */
create or replace function public.admin_clear_suspension(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  update public.profiles set suspended_at = null, suspended_reason = null where id = p_user;
  insert into public.admin_actions (admin_id, action, target) values (auth.uid(), 'clear_suspension', p_user::text);
end $$;

-- ---------------------------------------------------------------------
-- Existing functions/views, updated
-- ---------------------------------------------------------------------
create or replace function public.start_call(p_host_id uuid, p_call_type public.call_type, p_booking_id uuid default null)
returns public.call_sessions language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_host public.host_profiles;
  v_price integer;
  v_balance bigint;
  v_test bigint;
  v_live boolean;
  v_needed bigint;
  v public.call_sessions;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into v_host from public.host_profiles where id = p_host_id;
  if not found or not v_host.is_published then raise exception 'This host is not available.' using errcode = 'P0001', hint = 'host_unavailable'; end if;
  if v_host.user_id = v_uid then raise exception 'You can''t call yourself.' using errcode = 'P0001', hint = 'self_call'; end if;
  if exists (select 1 from public.profiles where id = v_uid and suspended_at is not null) then
    raise exception 'Your account is suspended. Contact support.' using errcode = 'P0001', hint = 'suspended';
  end if;
  -- Blocked (either way): the host simply isn't available; nobody is told about the block.
  if public.users_blocked(v_uid, v_host.user_id) then
    raise exception 'This host is not available.' using errcode = 'P0001', hint = 'host_unavailable';
  end if;
  -- The host declined your last N calls in the past 24 h: wait before calling again.
  if public.declined_too_often(v_uid, p_host_id) then
    raise exception 'This host can''t take your calls right now. Please try again later.' using errcode = 'P0001', hint = 'declined_limit';
  end if;
  if not (p_call_type = any (v_host.call_types)) then raise exception 'This host doesn''t offer % calls.', p_call_type using errcode = 'P0001'; end if;
  if p_booking_id is not null and not exists (
    select 1 from public.bookings b where b.id = p_booking_id and b.customer_id = v_uid and b.host_id = p_host_id and b.status = 'confirmed'
  ) then raise exception 'Booking not found.' using errcode = 'P0001'; end if;

  select case when p_call_type = 'video' then coalesce(video_cents_per_minute, audio_cents_per_minute) else audio_cents_per_minute end
    into v_price from public.host_pricing where host_id = p_host_id;
  if v_price is null then raise exception 'This host has no price set.' using errcode = 'P0001'; end if;

  -- Close stale calls (nobody connected for longer than the grace period) so they don't block.
  update public.call_sessions set status = case when status = 'ringing' then 'failed'::public.call_status else 'ended'::public.call_status end,
         end_reason = case when status = 'ringing' then 'failed_to_connect' else 'dropped' end, ended_at = now()
   where (customer_id = v_uid or host_id = p_host_id) and status in ('ringing', 'connected')
     and coalesce(last_connected_at, created_at) < now() - make_interval(secs => greatest(public.setting('call_grace_seconds'), public.setting('call_ring_timeout_seconds')));

  insert into public.wallets (user_id) values (v_uid) on conflict do nothing;
  select balance_cents, test_balance_cents into v_balance, v_test from public.wallets where user_id = v_uid;
  v_needed := ceil(v_price * public.setting('call_min_start_seconds') / 60.0);
  -- Real money first: the call is "live" only when paid with real balance.
  -- Test balance can only pay test calls (whose host earnings can never be paid out).
  if v_balance >= v_needed then
    v_live := true;
  elsif coalesce(public.setting('allow_test_calls'), 0) = 1 and v_test >= v_needed then
    v_live := false;
  else
    raise exception 'Add at least % cents to start this call.', v_needed - v_balance using errcode = 'P0001', hint = 'insufficient_balance';
  end if;

  insert into public.call_sessions (booking_id, customer_id, host_id, call_type, price_cents_per_minute, commission_bps, room_name, livemode)
  values (p_booking_id, v_uid, p_host_id, p_call_type, v_price, public.setting('commission_bps'),
          'humi-' || replace(gen_random_uuid()::text, '-', ''), v_live)
  returning * into v;
  return v;
exception when unique_violation then
  raise exception 'There is already an active call for you or this host.' using errcode = 'P0001', hint = 'call_in_progress';
end $$;

create or replace function public.bookings_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_host public.host_profiles;
  v_quote record;
  v_uid uuid := auth.uid();
begin
  -- Signed-in callers can only book for themselves (service role / SQL editor have no uid).
  if v_uid is not null and new.customer_id is distinct from v_uid then
    raise exception 'You can only book sessions for yourself.' using errcode = '42501';
  end if;

  select * into v_host from public.host_profiles where id = new.host_id;
  if not found or not v_host.is_published then
    raise exception 'This host is not accepting bookings.' using errcode = 'P0001', hint = 'host_unavailable';
  end if;
  if v_host.user_id = new.customer_id then
    raise exception 'You can''t book a session with yourself.' using errcode = 'P0001', hint = 'self_booking';
  end if;
  if exists (select 1 from public.profiles where id = new.customer_id and suspended_at is not null) then
    raise exception 'Your account is suspended. Contact support.' using errcode = 'P0001', hint = 'suspended';
  end if;
  if public.users_blocked(new.customer_id, v_host.user_id) then
    raise exception 'This host is not accepting bookings.' using errcode = 'P0001', hint = 'host_unavailable';
  end if;
  if not (new.call_type = any (v_host.call_types)) then
    raise exception 'This host doesn''t offer % sessions.', new.call_type using errcode = 'P0001', hint = 'call_type_unavailable';
  end if;
  if new.scheduled_at < now() + interval '30 minutes' then
    raise exception 'Sessions must be booked at least 30 minutes in advance.' using errcode = 'P0001', hint = 'too_soon';
  end if;
  if new.scheduled_at > now() + interval '60 days' then
    raise exception 'Sessions can be booked up to 60 days ahead.' using errcode = 'P0001', hint = 'too_far';
  end if;

  -- The whole session must fit inside one of the host's weekly windows (in the window's own time zone).
  if not exists (
    select 1
    from public.host_availability a
    cross join lateral (select (new.scheduled_at at time zone a.timezone) as local_start) l
    where a.host_id = new.host_id
      and extract(dow from l.local_start) = a.day_of_week
      and l.local_start::time >= a.start_time
      and (l.local_start::time - time '00:00') + make_interval(mins => new.duration_minutes) <= (a.end_time - time '00:00')
  ) then
    raise exception 'That time is outside the host''s availability.' using errcode = 'P0001', hint = 'outside_availability';
  end if;

  select * into v_quote from public.humi_price_quote(v_host.session_price, new.duration_minutes, new.call_type);

  new.ends_at       := new.scheduled_at + make_interval(mins => new.duration_minutes);
  new.subtotal      := v_quote.subtotal;
  new.total_price   := v_quote.total_price;
  new.platform_fee  := v_quote.platform_fee;
  new.host_earnings := v_quote.host_earnings;
  new.currency      := 'USD';
  new.status        := 'pending';
  new.cancelled_by  := null;
  new.created_at    := now();
  new.updated_at    := now();
  return new;
end $$;

create or replace function public.admin_set_setting(p_key text, p_value bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old bigint;
begin
  perform public.assert_admin();
  -- Only known settings, each within sane limits.
  if not (
       (p_key = 'commission_bps'             and p_value between 0 and 9000)
    or (p_key = 'auto_suspend_reports'       and p_value between 0 and 50)
    or (p_key = 'declined_call_limit'        and p_value between 0 and 20)
    or (p_key = 'price_min_cents_per_minute' and p_value between 10 and 100000)
    or (p_key = 'price_max_cents_per_minute' and p_value between 10 and 100000)
    or (p_key = 'topup_min_cents'            and p_value between 100 and 10000000)
    or (p_key = 'topup_max_cents'            and p_value between 100 and 10000000)
    or (p_key = 'call_min_start_seconds'     and p_value between 0 and 3600)
    or (p_key = 'call_grace_seconds'         and p_value between 10 and 600)
    or (p_key = 'call_ring_timeout_seconds'  and p_value between 15 and 600)
    or (p_key = 'earnings_hold_days'         and p_value between 0 and 90)
    or (p_key = 'payout_min_cents'           and p_value between 1 and 10000000)
    or (p_key = 'allow_test_calls'           and p_value in (0, 1))
    or (p_key = 'first_topup_bonus_cents'    and p_value between 0 and 100000)
    or (p_key = 'first_topup_bonus_min_cents' and p_value between 0 and 10000000)
    or (p_key = 'referral_bonus_cents'       and p_value between 0 and 100000)
  ) then
    raise exception 'Invalid value for this setting.' using errcode = 'P0001';
  end if;
  if p_key = 'price_min_cents_per_minute' and p_value > public.setting('price_max_cents_per_minute') then
    raise exception 'The minimum price can''t be above the maximum.' using errcode = 'P0001';
  end if;
  if p_key = 'price_max_cents_per_minute' and p_value < public.setting('price_min_cents_per_minute') then
    raise exception 'The maximum price can''t be below the minimum.' using errcode = 'P0001';
  end if;
  select value into v_old from public.platform_settings where key = p_key;
  if not found then raise exception 'Unknown setting.' using errcode = 'P0001'; end if;
  update public.platform_settings set value = p_value, updated_at = now() where key = p_key;
  perform public.admin_log('setting', p_key, jsonb_build_object('from', v_old, 'to', p_value));
end $$;

create or replace view public.public_hosts as
select
  hp.id, hp.display_name, hp.tagline, hp.description, hp.experience, hp.session_price, hp.hourly_rate,
  hp.categories, hp.call_types, hp.timezone, hp.is_available, hp.is_verified, hp.average_rating,
  hp.review_count, hp.total_sessions, hp.created_at,
  p.avatar_url, p.bio, p.country, p.city, p.languages, p.interests, p.is_sample,
  coalesce((
    select jsonb_agg(jsonb_build_object('day_of_week', a.day_of_week, 'start_time', a.start_time, 'end_time', a.end_time, 'timezone', a.timezone)
                     order by a.day_of_week, a.start_time)
    from public.host_availability a where a.host_id = hp.id
  ), '[]'::jsonb) as availability,
  p.region,
  coalesce(hp.is_available and hp.last_seen_at > now() - interval '90 seconds', false) as is_online,
  pr.audio_cents_per_minute,
  pr.video_cents_per_minute
from public.host_profiles hp
join public.profiles p on p.id = hp.user_id
left join public.host_pricing pr on pr.host_id = hp.id
where hp.is_published and p.role = 'host'
  -- People who blocked you (or you blocked) don't see each other.
  and not exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = hp.user_id and ub.blocked_id = auth.uid())
       or (ub.blocker_id = auth.uid() and ub.blocked_id = hp.user_id)
  );

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
revoke execute on function public.users_blocked(uuid, uuid), public.declined_too_often(uuid, uuid), public.other_party(uuid, uuid, uuid),
  public.suspend_user(uuid, text), public.user_reports_auto_suspend() from public, anon, authenticated;
revoke execute on function public.block_user(uuid, uuid, uuid), public.unblock_user(uuid), public.my_blocks(),
  public.accept_call_rules(), public.call_rules_accepted(), public.admin_clear_suspension(uuid) from public, anon;
grant execute on function public.block_user(uuid, uuid, uuid), public.unblock_user(uuid), public.my_blocks(),
  public.accept_call_rules(), public.call_rules_accepted(), public.admin_clear_suspension(uuid) to authenticated;
grant select on public.public_hosts to anon, authenticated;

notify pgrst, 'reload schema';

-- ===================== 20261116170000_fair_ratings.sql =====================
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
