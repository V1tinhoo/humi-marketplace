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
