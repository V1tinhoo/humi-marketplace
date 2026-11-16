-- =====================================================================
-- HUMI · Demo hosts, private preview and simulated calls (internal testing)
--
-- Fully separate from the real marketplace:
--   * demo_hosts / demo_reviews / demo_wallets / demo_call_sessions /
--     demo_billing_records are their own tables. Nothing here is read by the
--     public views (public_hosts, public_reviews), the wallet, payouts, admin
--     revenue figures or any real billing function.
--   * Every row carries a flag that can only be true (is_demo / is_simulated).
--   * Demo hosts have no user account, no "verified" field and no payouts.
--   * Simulated calls spend a fictional test balance (demo_wallets), never the
--     real or test balance of the real wallet.
--   * Only admins and people the admin adds as preview testers can see or use
--     any of it; everything is checked in the database.
--
-- Commission: HUMI 20% / host 80% (platform_settings.commission_bps = 2000).
-- One rounding rule everywhere: host = floor(total × 80%), HUMI = the rest, so
-- the two parts always add up to exactly what was charged.
-- Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Commission 20% (single setting used by every calculation)
-- ---------------------------------------------------------------------
update public.platform_settings
   set value = 2000, description = 'HUMI commission in basis points (2000 = 20%). The host receives the rest (80%).'
 where key = 'commission_bps';

insert into public.platform_settings (key, value, description) values
  ('demo_enabled',       1,  'Demo hosts / private preview on (1) or off (0).'),
  ('demo_calls_enabled', 1,  'Simulated calls with demo hosts on (1) or off (0).'),
  ('demo_max_hosts',     24, 'How many demo hosts the preview shows (by order).')
on conflict (key) do nothing;

/** Splits an amount into host and HUMI parts. Host is rounded down; the leftover cent(s) go to HUMI. */
create or replace function public.commission_split(p_total bigint, p_commission_bps integer)
returns table (host_cents bigint, platform_cents bigint) language sql immutable as $$
  select floor(p_total::numeric * (10000 - p_commission_bps) / 10000)::bigint,
         p_total - floor(p_total::numeric * (10000 - p_commission_bps) / 10000)::bigint
$$;

-- ---------------------------------------------------------------------
-- Categories (admin can add more later)
-- ---------------------------------------------------------------------
create table if not exists public.host_categories (
  slug        text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  label_en    text not null check (char_length(label_en) between 1 and 60),
  label_pt    text not null check (char_length(label_pt) between 1 and 60),
  sort_order  integer not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.host_categories enable row level security;
drop policy if exists "categories: read" on public.host_categories;
drop policy if exists "categories: admin writes" on public.host_categories;
create policy "categories: read" on public.host_categories for select to anon, authenticated using (true);
create policy "categories: admin writes" on public.host_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.host_categories from anon, authenticated;
grant select on public.host_categories to anon, authenticated;
grant insert, update, delete on public.host_categories to authenticated;

insert into public.host_categories (slug, label_en, label_pt, sort_order) values
  ('casual-conversation', 'Casual Conversation', 'Bate-papo', 10),
  ('english-practice',    'English Practice',    'Praticar inglês', 20),
  ('language-exchange',   'Language Exchange',   'Troca de idiomas', 30),
  ('gaming',              'Gaming',              'Games', 40),
  ('movies-series',       'Movies & Series',     'Filmes e séries', 50),
  ('music',               'Music',               'Música', 60),
  ('travel-culture',      'Travel & Culture',    'Viagens e cultura', 70),
  ('daily-life',          'Daily Life',          'Dia a dia', 80),
  ('making-friends',      'Making Friends',      'Fazer amigos', 90),
  ('hobbies',             'Hobbies',             'Hobbies', 100),
  ('other-interests',     'Other Interests',     'Outros interesses', 110)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- Who may open the preview: admins + people the admin adds
-- ---------------------------------------------------------------------
create table if not exists public.preview_testers (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  added_by    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.preview_testers enable row level security;
revoke all on public.preview_testers from anon, authenticated;

create or replace function public.can_preview()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    public.is_admin() or exists (select 1 from public.preview_testers where user_id = auth.uid())
  )
$$;

create or replace function public.assert_preview(p_need_calls boolean default false)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_preview() then
    raise exception 'The preview is only for admins and invited testers.' using errcode = '42501';
  end if;
  if coalesce(public.setting('demo_enabled'), 0) <> 1 then
    raise exception 'Demo hosts are switched off.' using errcode = 'P0001', hint = 'demo_disabled';
  end if;
  if p_need_calls and coalesce(public.setting('demo_calls_enabled'), 0) <> 1 then
    raise exception 'Simulated calls are switched off.' using errcode = 'P0001', hint = 'demo_calls_disabled';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Demo hosts (fictional) and their simulated reviews
-- ---------------------------------------------------------------------
create table if not exists public.demo_hosts (
  id                      uuid primary key default gen_random_uuid(),
  is_demo                 boolean not null default true check (is_demo),
  display_name            text not null check (char_length(display_name) between 1 and 40),
  age                     integer check (age between 18 and 99),
  country                 text not null default '' check (char_length(country) <= 60),
  city                    text not null default '' check (char_length(city) <= 60),
  timezone                text not null default 'America/Sao_Paulo',
  languages               text[] not null default '{}' check (cardinality(languages) <= 10),
  interests               text[] not null default '{}' check (cardinality(interests) <= 20),
  categories              text[] not null default '{}' check (cardinality(categories) <= 11),
  tagline                 text not null default '' check (char_length(tagline) <= 140),
  bio                     text not null default '' check (char_length(bio) <= 2000),
  photo_url               text check (photo_url is null or photo_url ~ '^https://'),
  audio_cents_per_minute  integer not null default 100 check (audio_cents_per_minute between 1 and 100000),
  video_cents_per_minute  integer check (video_cents_per_minute is null or video_cents_per_minute between 1 and 100000),
  call_types              text[] not null default '{audio,video}' check (call_types <@ array['audio','video']::text[] and cardinality(call_types) >= 1),
  is_active               boolean not null default true,   -- individual on/off
  show_in_preview         boolean not null default true,   -- listed in the preview
  is_online               boolean not null default false,  -- simulated presence
  availability            jsonb not null default '[]'::jsonb,
  rating_avg              numeric(3, 2) not null default 0, -- from demo_reviews only
  review_count            integer not null default 0,
  sort_order              integer not null default 100,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists public.demo_reviews (
  id                   uuid primary key default gen_random_uuid(),
  is_simulated         boolean not null default true check (is_simulated),
  demo_host_id         uuid not null references public.demo_hosts (id) on delete cascade,
  reviewer_name        text not null check (char_length(reviewer_name) between 1 and 40),
  reviewer_avatar_url  text check (reviewer_avatar_url is null or reviewer_avatar_url ~ '^https://'),
  rating               smallint not null check (rating between 1 and 5),
  comment              text not null default '' check (char_length(comment) <= 1000),
  language             text not null default 'pt' check (char_length(language) <= 10),
  review_date          date not null default current_date,
  created_at           timestamptz not null default now()
);
create index if not exists demo_reviews_host_idx on public.demo_reviews (demo_host_id, review_date desc);

create or replace function public.demo_hosts_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.is_demo := true;
  return new;
end $$;
drop trigger if exists demo_hosts_touch on public.demo_hosts;
create trigger demo_hosts_touch before insert or update on public.demo_hosts for each row execute function public.demo_hosts_touch();

create or replace function public.demo_reviews_refresh()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_host uuid := coalesce(new.demo_host_id, old.demo_host_id);
begin
  update public.demo_hosts h set
    rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2) from public.demo_reviews r where r.demo_host_id = v_host), 0),
    review_count = (select count(*) from public.demo_reviews r where r.demo_host_id = v_host)
  where h.id = v_host;
  return null;
end $$;
drop trigger if exists demo_reviews_refresh on public.demo_reviews;
create trigger demo_reviews_refresh after insert or update or delete on public.demo_reviews for each row execute function public.demo_reviews_refresh();

-- Admins manage everything directly (RLS); preview users read through the preview_* functions.
alter table public.demo_hosts enable row level security;
alter table public.demo_reviews enable row level security;
drop policy if exists "demo hosts: admin" on public.demo_hosts;
drop policy if exists "demo reviews: admin" on public.demo_reviews;
create policy "demo hosts: admin" on public.demo_hosts for all to authenticated using (public.is_admin()) with check (public.is_admin() and is_demo);
create policy "demo reviews: admin" on public.demo_reviews for all to authenticated using (public.is_admin()) with check (public.is_admin() and is_simulated);
revoke all on public.demo_hosts, public.demo_reviews from anon, authenticated;
grant select, insert, update, delete on public.demo_hosts, public.demo_reviews to authenticated;

-- ---------------------------------------------------------------------
-- Fictional test balance and simulated calls
-- ---------------------------------------------------------------------
create table if not exists public.demo_wallets (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  is_simulated   boolean not null default true check (is_simulated),
  balance_cents  bigint not null default 5000 check (balance_cents >= 0),
  updated_at     timestamptz not null default now()
);

create table if not exists public.demo_call_sessions (
  id                      uuid primary key default gen_random_uuid(),
  is_simulated            boolean not null default true check (is_simulated),
  demo_host_id            uuid references public.demo_hosts (id) on delete set null,
  host_name               text not null,
  user_id                 uuid not null references auth.users (id) on delete cascade,
  call_type               text not null check (call_type in ('audio', 'video')),
  price_cents_per_minute  integer not null check (price_cents_per_minute > 0),
  commission_bps          integer not null check (commission_bps between 0 and 10000),
  status                  text not null default 'ringing' check (status in ('ringing', 'connected', 'reconnecting', 'ended', 'failed')),
  end_reason              text,
  start_balance_cents     bigint not null default 0,
  billed_seconds          integer not null default 0,
  charged_cents           bigint not null default 0,
  host_cents              bigint not null default 0,
  platform_cents          bigint not null default 0,
  created_at              timestamptz not null default now(),
  connected_at            timestamptz,
  last_tick_at            timestamptz,
  ended_at                timestamptz,
  check (host_cents + platform_cents = charged_cents)
);
create index if not exists demo_call_sessions_user_idx on public.demo_call_sessions (user_id, created_at desc);
create index if not exists demo_call_sessions_host_idx on public.demo_call_sessions (demo_host_id, created_at desc);
create unique index if not exists demo_call_sessions_one_active on public.demo_call_sessions (user_id) where status in ('ringing', 'connected', 'reconnecting');

create table if not exists public.demo_billing_records (
  id               bigint generated always as identity primary key,
  is_simulated     boolean not null default true check (is_simulated),
  demo_session_id  uuid not null references public.demo_call_sessions (id) on delete cascade,
  seconds          integer not null,
  amount_cents     bigint not null,
  host_cents       bigint not null,
  platform_cents   bigint not null,
  created_at       timestamptz not null default now(),
  check (host_cents + platform_cents = amount_cents)
);

alter table public.demo_wallets enable row level security;
alter table public.demo_call_sessions enable row level security;
alter table public.demo_billing_records enable row level security;
drop policy if exists "demo wallets: own" on public.demo_wallets;
drop policy if exists "demo sessions: own or admin" on public.demo_call_sessions;
drop policy if exists "demo billing: own or admin" on public.demo_billing_records;
create policy "demo wallets: own" on public.demo_wallets for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "demo sessions: own or admin" on public.demo_call_sessions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "demo billing: own or admin" on public.demo_billing_records for select to authenticated
  using (public.is_admin() or exists (select 1 from public.demo_call_sessions s where s.id = demo_session_id and s.user_id = auth.uid()));
revoke all on public.demo_wallets, public.demo_call_sessions, public.demo_billing_records from anon, authenticated;
grant select on public.demo_wallets, public.demo_call_sessions, public.demo_billing_records to authenticated;
-- No insert/update/delete grants: only the functions below change these tables.

-- ---------------------------------------------------------------------
-- Preview: read
-- ---------------------------------------------------------------------
create or replace function public.preview_status()
returns table (allowed boolean, is_admin boolean, demo_enabled boolean, calls_enabled boolean, commission_bps integer, balance_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query select
    public.can_preview(),
    public.is_admin(),
    coalesce(public.setting('demo_enabled'), 0) = 1,
    coalesce(public.setting('demo_calls_enabled'), 0) = 1,
    case when public.can_preview() then public.setting('commission_bps')::integer end,
    case when public.can_preview() then coalesce((select w.balance_cents from public.demo_wallets w where w.user_id = auth.uid()), 5000) end;
end $$;

create or replace function public.preview_hosts()
returns setof public.demo_hosts language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_preview();
  return query
    select * from public.demo_hosts
    where is_active and show_in_preview
    order by sort_order, created_at
    limit greatest(coalesce(public.setting('demo_max_hosts'), 24), 0);
end $$;

create or replace function public.preview_host(p_id uuid)
returns setof public.demo_hosts language plpgsql stable security definer set search_path = '' as $$
begin
  -- Admins can open any demo host ("view as client"), even hidden ones.
  perform public.assert_preview();
  return query
    select h.* from public.demo_hosts h
    where h.id = p_id and (public.is_admin() or h.id in (select x.id from public.preview_hosts() x));
end $$;

create or replace function public.preview_reviews(p_host uuid)
returns setof public.demo_reviews language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_preview();
  if not exists (select 1 from public.preview_host(p_host)) then return; end if;
  return query select * from public.demo_reviews where demo_host_id = p_host order by review_date desc, created_at desc limit 50;
end $$;

-- ---------------------------------------------------------------------
-- Fictional test balance
-- ---------------------------------------------------------------------
create or replace function public.demo_set_balance(p_cents bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_preview();
  if p_cents is null or p_cents < 0 or p_cents > 1000000 then
    raise exception 'Test balance must be between R$ 0 and R$ 10.000.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.demo_call_sessions where user_id = auth.uid() and status in ('ringing', 'connected', 'reconnecting')) then
    raise exception 'Finish the test call before changing the test balance.' using errcode = 'P0001';
  end if;
  insert into public.demo_wallets (user_id, balance_cents) values (auth.uid(), p_cents)
  on conflict (user_id) do update set balance_cents = excluded.balance_cents, updated_at = now();
  return p_cents;
end $$;

-- ---------------------------------------------------------------------
-- Simulated calls
-- ---------------------------------------------------------------------
create or replace function public.demo_call_start(p_host uuid, p_call_type text)
returns public.demo_call_sessions language plpgsql security definer set search_path = '' as $$
declare h public.demo_hosts; v_price integer; v_balance bigint; v_needed bigint; s public.demo_call_sessions;
begin
  perform public.assert_preview(true);
  select * into h from public.preview_host(p_host);
  if h.id is null or not h.is_active then raise exception 'This host is not available.' using errcode = 'P0001'; end if;
  if p_call_type not in ('audio', 'video') or not (p_call_type = any (h.call_types)) then
    raise exception 'This host doesn''t offer % calls.', p_call_type using errcode = 'P0001';
  end if;
  v_price := case when p_call_type = 'video' then coalesce(h.video_cents_per_minute, h.audio_cents_per_minute) else h.audio_cents_per_minute end;

  -- Close a forgotten test call so it doesn't block a new one.
  update public.demo_call_sessions set status = case when status = 'ringing' then 'failed' else 'ended' end,
         end_reason = 'abandoned', ended_at = now()
   where user_id = auth.uid() and status in ('ringing', 'connected', 'reconnecting')
     and coalesce(last_tick_at, created_at) < now() - interval '2 minutes';

  insert into public.demo_wallets (user_id) values (auth.uid()) on conflict do nothing;
  select balance_cents into v_balance from public.demo_wallets where user_id = auth.uid();
  v_needed := ceil(v_price * coalesce(public.setting('call_min_start_seconds'), 60) / 60.0);
  if v_balance < v_needed then
    raise exception 'Add at least % cents of test balance to start this call.', v_needed - v_balance using errcode = 'P0001', hint = 'insufficient_balance';
  end if;

  insert into public.demo_call_sessions (demo_host_id, host_name, user_id, call_type, price_cents_per_minute, commission_bps, start_balance_cents, last_tick_at)
  values (h.id, h.display_name, auth.uid(), p_call_type, v_price, public.setting('commission_bps'), v_balance, now())
  returning * into s;
  return s;
exception when unique_violation then
  raise exception 'You already have a test call in progress.' using errcode = 'P0001';
end $$;

/**
 * Same rules as real billing (call_tick), on fictional money:
 *  - only time while "connected" is billed, from the database clock (max 30 s per tick);
 *  - p_extra_seconds lets testers fast-forward (max 1 h per call to this function);
 *  - total due = floor(price × seconds / 60), each tick charges the difference;
 *  - split on the running total: host = floor(total × (1 − commission)), HUMI = the rest;
 *  - when the test balance runs out the call ends ('insufficient_funds').
 */
create or replace function public.demo_call_tick(p_id uuid, p_connected boolean, p_extra_seconds integer default 0)
returns public.demo_call_sessions language plpgsql security definer set search_path = '' as $$
declare
  s public.demo_call_sessions;
  v_now timestamptz := now();
  v_secs integer;
  v_due bigint;
  v_delta bigint;
  v_balance bigint;
  v_host_total bigint;
  v_host_delta bigint;
  v_out boolean := false;
begin
  if auth.uid() is null then raise exception 'Please log in.' using errcode = '42501'; end if;
  select * into s from public.demo_call_sessions where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Test call not found.' using errcode = 'P0002'; end if;
  if s.status in ('ended', 'failed') then return s; end if;

  if s.status = 'ringing' then
    if p_connected then
      update public.demo_call_sessions set status = 'connected', connected_at = v_now, last_tick_at = v_now where id = s.id returning * into s;
    end if;
    return s;
  end if;

  if not p_connected then
    -- Simulated drop: nothing is billed while reconnecting.
    update public.demo_call_sessions set status = 'reconnecting', last_tick_at = v_now where id = s.id returning * into s;
    return s;
  end if;

  if s.status = 'reconnecting' then
    update public.demo_call_sessions set status = 'connected', last_tick_at = v_now where id = s.id returning * into s;
    return s;
  end if;

  v_secs := least(greatest(floor(extract(epoch from (v_now - s.last_tick_at)))::integer, 0), 30)
          + least(greatest(coalesce(p_extra_seconds, 0), 0), 3600);
  if v_secs <= 0 then return s; end if;

  v_due := floor(s.price_cents_per_minute::numeric * (s.billed_seconds + v_secs) / 60);
  v_delta := v_due - s.charged_cents;
  insert into public.demo_wallets (user_id) values (s.user_id) on conflict do nothing;
  select balance_cents into v_balance from public.demo_wallets where user_id = s.user_id for update;
  if v_delta >= v_balance then
    v_delta := v_balance;
    v_out := true;
  end if;

  select c.host_cents into v_host_total from public.commission_split(s.charged_cents + v_delta, s.commission_bps) c;
  v_host_delta := v_host_total - s.host_cents;

  if v_delta > 0 then
    update public.demo_wallets set balance_cents = balance_cents - v_delta, updated_at = v_now where user_id = s.user_id;
    insert into public.demo_billing_records (demo_session_id, seconds, amount_cents, host_cents, platform_cents)
    values (s.id, v_secs, v_delta, v_host_delta, v_delta - v_host_delta);
  end if;

  update public.demo_call_sessions set
    billed_seconds = billed_seconds + v_secs,
    charged_cents  = charged_cents + v_delta,
    host_cents     = host_cents + v_host_delta,
    platform_cents = platform_cents + (v_delta - v_host_delta),
    last_tick_at   = v_now,
    status     = case when v_out then 'ended' else status end,
    end_reason = case when v_out then 'insufficient_funds' else end_reason end,
    ended_at   = case when v_out then v_now else ended_at end
  where id = s.id returning * into s;
  return s;
end $$;

create or replace function public.demo_call_end(p_id uuid, p_reason text default 'user_hangup')
returns public.demo_call_sessions language plpgsql security definer set search_path = '' as $$
declare s public.demo_call_sessions;
begin
  select * into s from public.demo_call_sessions where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Test call not found.' using errcode = 'P0002'; end if;
  if s.status = 'connected' then s := public.demo_call_tick(p_id, true, 0); end if;
  if s.status in ('ended', 'failed') then return s; end if;
  update public.demo_call_sessions set
    status = case when connected_at is null then 'failed' else 'ended' end,
    end_reason = case when p_reason in ('user_hangup', 'no_answer', 'connection_lost', 'cancelled') then p_reason else 'user_hangup' end,
    ended_at = now(), last_tick_at = now()
  where id = p_id returning * into s;
  return s;
end $$;

-- ---------------------------------------------------------------------
-- History
-- ---------------------------------------------------------------------
create or replace function public.demo_call_history(p_host uuid default null, p_from date default null, p_to date default null, p_type text default null, p_all boolean default false)
returns table (
  id uuid, host_id uuid, host_name text, user_email text, call_type text, status text, end_reason text,
  created_at timestamptz, connected_at timestamptz, ended_at timestamptz, billed_seconds integer,
  price_cents_per_minute integer, charged_cents bigint, host_cents bigint, platform_cents bigint, commission_bps integer
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_preview() then raise exception 'The preview is only for admins and invited testers.' using errcode = '42501'; end if;
  return query
    select s.id, s.demo_host_id, s.host_name, u.email::text, s.call_type, s.status, s.end_reason,
           s.created_at, s.connected_at, s.ended_at, s.billed_seconds,
           s.price_cents_per_minute, s.charged_cents, s.host_cents, s.platform_cents, s.commission_bps
    from public.demo_call_sessions s
    join auth.users u on u.id = s.user_id
    where (s.user_id = auth.uid() or (p_all and public.is_admin()))
      and (p_host is null or s.demo_host_id = p_host)
      and (p_type is null or s.call_type = p_type)
      and (p_from is null or s.created_at >= p_from::timestamptz)
      and (p_to is null or s.created_at < (p_to + 1)::timestamptz)
    order by s.created_at desc
    limit 500;
end $$;

-- ---------------------------------------------------------------------
-- Admin: preview testers
-- ---------------------------------------------------------------------
create or replace function public.admin_preview_testers()
returns table (user_id uuid, email text, full_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  return query select t.user_id, u.email::text, coalesce(p.full_name, ''), t.created_at
    from public.preview_testers t join auth.users u on u.id = t.user_id left join public.profiles p on p.id = t.user_id
    order by t.created_at desc;
end $$;

create or replace function public.admin_add_preview_tester(p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  perform public.assert_admin();
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then raise exception 'No account with this e-mail. The person must sign up first.' using errcode = 'P0001'; end if;
  insert into public.preview_testers (user_id, added_by) values (v_user, auth.uid()) on conflict do nothing;
  perform public.admin_log('add_preview_tester', v_user::text, '{}'::jsonb);
  return v_user;
end $$;

create or replace function public.admin_remove_preview_tester(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin();
  delete from public.preview_testers where user_id = p_user;
  perform public.admin_log('remove_preview_tester', p_user::text, '{}'::jsonb);
end $$;

-- Admin settings: new demo keys (commission stays editable as before).
create or replace function public.admin_set_setting(p_key text, p_value bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old bigint;
begin
  perform public.assert_admin();
  -- Only known settings, each within sane limits.
  if not (
       (p_key = 'commission_bps'             and p_value between 0 and 9000)
    or (p_key = 'demo_enabled'               and p_value between 0 and 1)
    or (p_key = 'demo_calls_enabled'         and p_value between 0 and 1)
    or (p_key = 'demo_max_hosts'             and p_value between 0 and 500)
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

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
revoke execute on function public.can_preview(), public.assert_preview(boolean), public.preview_status(), public.preview_hosts(), public.preview_host(uuid),
  public.preview_reviews(uuid), public.demo_set_balance(bigint), public.demo_call_start(uuid, text), public.demo_call_tick(uuid, boolean, integer),
  public.demo_call_end(uuid, text), public.demo_call_history(uuid, date, date, text, boolean), public.admin_preview_testers(),
  public.admin_add_preview_tester(text), public.admin_remove_preview_tester(uuid), public.demo_reviews_refresh() from public, anon;
grant execute on function public.can_preview(), public.preview_status(), public.preview_hosts(), public.preview_host(uuid),
  public.preview_reviews(uuid), public.demo_set_balance(bigint), public.demo_call_start(uuid, text), public.demo_call_tick(uuid, boolean, integer),
  public.demo_call_end(uuid, text), public.demo_call_history(uuid, date, date, text, boolean), public.admin_preview_testers(),
  public.admin_add_preview_tester(text), public.admin_remove_preview_tester(uuid) to authenticated;
revoke execute on function public.assert_preview(boolean), public.demo_reviews_refresh() from authenticated;
grant execute on function public.commission_split(bigint, integer) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Fictional hosts and simulated reviews to start with (only visible in the preview)
-- ---------------------------------------------------------------------
insert into public.demo_hosts (id, display_name, age, country, city, timezone, languages, interests, categories, tagline, bio, photo_url, audio_cents_per_minute, video_cents_per_minute, call_types, is_online, availability, sort_order)
values ('00000000-0000-4000-8000-000000000001', 'Emily', 27, 'Canada', 'Toronto', 'America/Toronto', array['English', 'French']::text[], array['Trilhas', 'Jogos de tabuleiro', 'Café', 'Podcasts']::text[], array['english-practice', 'casual-conversation', 'travel-culture']::text[], 'Inglês sem pressão com uma canadense que adora puxar assunto', 'Sou pesquisadora de UX em Toronto, então fazer perguntas e ouvir de verdade faz parte do meu trabalho. Já ajudei amigos do Brasil e do México a perderem a vergonha de falar inglês: a gente conversa sobre a vida real e eu vou mostrando, com calma, as expressões que soam mais naturais. Me pergunta como sobreviver ao inverno canadense, onde comer a melhor poutine ou por que a gente pede desculpa por tudo.', 'https://api.dicebear.com/9.x/notionists/svg?seed=Emily-humi&backgroundColor=e5ddfb,fceaf2,ffe9d6', 90, 120, array['audio', 'video']::text[], true, '[{"day_of_week":1,"start_time":"18:00","end_time":"23:00","timezone":"America/Toronto"},{"day_of_week":2,"start_time":"18:00","end_time":"23:00","timezone":"America/Toronto"},{"day_of_week":3,"start_time":"18:00","end_time":"23:00","timezone":"America/Toronto"},{"day_of_week":4,"start_time":"18:00","end_time":"23:00","timezone":"America/Toronto"},{"day_of_week":5,"start_time":"18:00","end_time":"23:00","timezone":"America/Toronto"}]'::jsonb, 1)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000001000001', '00000000-0000-4000-8000-000000000001', 'Rafael', 'https://api.dicebear.com/9.x/notionists/svg?seed=Rafael-r&backgroundColor=fceaf2', 5, 'A Emily me fez esquecer que eu estava falando em inglês. Corrige sem deixar a gente nervoso.', 'pt', current_date - 6)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000001000002', '00000000-0000-4000-8000-000000000001', 'Juliana', 'https://api.dicebear.com/9.x/notionists/svg?seed=Juliana-r&backgroundColor=fceaf2', 5, 'Super paciente! Falamos de séries e ela me ensinou várias expressões.', 'pt', current_date - 12)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000001000003', '00000000-0000-4000-8000-000000000001', 'Caio', 'https://api.dicebear.com/9.x/notionists/svg?seed=Caio-r&backgroundColor=fceaf2', 4, 'Muito simpática e clara. Na próxima quero que ela me corrija um pouco mais.', 'pt', current_date - 18)
on conflict (id) do nothing;
insert into public.demo_hosts (id, display_name, age, country, city, timezone, languages, interests, categories, tagline, bio, photo_url, audio_cents_per_minute, video_cents_per_minute, call_types, is_online, availability, sort_order)
values ('00000000-0000-4000-8000-000000000002', 'Mateo', 31, 'Argentina', 'Córdoba', 'America/Argentina/Cordoba', array['Spanish', 'English', 'Portuguese']::text[], array['Futebol', 'Chimarrão', 'Violão', 'Churrasco']::text[], array['language-exchange', 'music', 'casual-conversation']::text[], 'Espanhol argentino, chimarrão e opiniões fortes sobre futebol', 'Sou de Córdoba e dou aula de música numa escola. Meu português é razoável porque passei dois verões em Florianópolis, então sei exatamente onde os brasileiros travam no espanhol (cuidado com os falsos amigos!). A gente pode trocar de idioma no meio da conversa, falar de clássico de futebol ou eu toco uma chacarera no violão pra você.', 'https://api.dicebear.com/9.x/notionists/svg?seed=Mateo-humi&backgroundColor=e5ddfb,fceaf2,ffe9d6', 60, 80, array['audio', 'video']::text[], true, '[{"day_of_week":1,"start_time":"17:00","end_time":"22:00","timezone":"America/Argentina/Cordoba"},{"day_of_week":3,"start_time":"17:00","end_time":"22:00","timezone":"America/Argentina/Cordoba"},{"day_of_week":5,"start_time":"17:00","end_time":"22:00","timezone":"America/Argentina/Cordoba"},{"day_of_week":6,"start_time":"17:00","end_time":"22:00","timezone":"America/Argentina/Cordoba"}]'::jsonb, 2)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000002000001', '00000000-0000-4000-8000-000000000002', 'Fernanda', 'https://api.dicebear.com/9.x/notionists/svg?seed=Fernanda-r&backgroundColor=fceaf2', 5, 'Melhor conversa em espanhol que já tive. Ele explica as gírias de um jeito muito engraçado.', 'pt', current_date - 7)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000002000002', '00000000-0000-4000-8000-000000000002', 'Lucas', 'https://api.dicebear.com/9.x/notionists/svg?seed=Lucas-r&backgroundColor=fceaf2', 5, 'Falamos de futebol por 20 minutos e nem vi o tempo passar.', 'pt', current_date - 13)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000002000003', '00000000-0000-4000-8000-000000000002', 'Ana', 'https://api.dicebear.com/9.x/notionists/svg?seed=Ana-r&backgroundColor=fceaf2', 4, 'Muito simpático, só achei que fala um pouco rápido no começo.', 'pt', current_date - 19)
on conflict (id) do nothing;
insert into public.demo_hosts (id, display_name, age, country, city, timezone, languages, interests, categories, tagline, bio, photo_url, audio_cents_per_minute, video_cents_per_minute, call_types, is_online, availability, sort_order)
values ('00000000-0000-4000-8000-000000000003', 'Aiko', 24, 'Japan', 'Osaka', 'Asia/Tokyo', array['Japanese', 'English']::text[], array['Animes', 'Lámen', 'Ilustração', 'J-pop']::text[], array['movies-series', 'travel-culture', 'hobbies']::text[], 'Ilustradora de Osaka: animes, comida e o dia a dia no Japão', 'Faço ilustrações no estilo mangá para pequenos estúdios de games e sou meio obcecada por rankings de lámen. Adoro explicar as coisas pequenas da vida no Japão que nunca aparecem nos vídeos de viagem: a etiqueta das lojas de conveniência, por que o humor de Osaka é diferente do de Tóquio, o que a gente come de verdade no café da manhã. Meu inglês não é perfeito, então a gente aprende junto!', 'https://api.dicebear.com/9.x/notionists/svg?seed=Aiko-humi&backgroundColor=e5ddfb,fceaf2,ffe9d6', 100, 140, array['audio', 'video']::text[], false, '[{"day_of_week":5,"start_time":"09:00","end_time":"13:00","timezone":"Asia/Tokyo"},{"day_of_week":6,"start_time":"09:00","end_time":"13:00","timezone":"Asia/Tokyo"},{"day_of_week":0,"start_time":"09:00","end_time":"13:00","timezone":"Asia/Tokyo"}]'::jsonb, 3)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000003000001', '00000000-0000-4000-8000-000000000003', 'Bruno', 'https://api.dicebear.com/9.x/notionists/svg?seed=Bruno-r&backgroundColor=fceaf2', 5, 'Conversa incrível sobre anime e cultura japonesa. Muito educada e divertida.', 'pt', current_date - 8)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000003000002', '00000000-0000-4000-8000-000000000003', 'Larissa', 'https://api.dicebear.com/9.x/notionists/svg?seed=Larissa-r&backgroundColor=fceaf2', 5, 'Aprendi mais sobre o Japão em 30 minutos do que em vários vídeos.', 'pt', current_date - 14)
on conflict (id) do nothing;
insert into public.demo_hosts (id, display_name, age, country, city, timezone, languages, interests, categories, tagline, bio, photo_url, audio_cents_per_minute, video_cents_per_minute, call_types, is_online, availability, sort_order)
values ('00000000-0000-4000-8000-000000000004', 'Oliver', 35, 'United Kingdom', 'Manchester', 'Europe/London', array['English']::text[], array['Premier League', 'Música indie', 'Cozinhar', 'Ciclismo']::text[], array['english-practice', 'music', 'daily-life']::text[], 'Inglês britânico, bandas indie e opiniões sinceras sobre futebol', 'Nasci e cresci em Manchester, trabalho como engenheiro de som e passo os fins de semana pedalando ou discutindo Premier League. Se você quer se acostumar com o sotaque britânico além do que aparece nos filmes, pode contar comigo: eu falo mais devagar quando precisar e te ensino as gírias que você ouviria de verdade num pub.', 'https://api.dicebear.com/9.x/notionists/svg?seed=Oliver-humi&backgroundColor=e5ddfb,fceaf2,ffe9d6', 120, 160, array['audio', 'video']::text[], true, '[{"day_of_week":1,"start_time":"19:00","end_time":"23:00","timezone":"Europe/London"},{"day_of_week":2,"start_time":"19:00","end_time":"23:00","timezone":"Europe/London"},{"day_of_week":4,"start_time":"19:00","end_time":"23:00","timezone":"Europe/London"},{"day_of_week":6,"start_time":"19:00","end_time":"23:00","timezone":"Europe/London"}]'::jsonb, 4)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000004000001', '00000000-0000-4000-8000-000000000004', 'Thiago', 'https://api.dicebear.com/9.x/notionists/svg?seed=Thiago-r&backgroundColor=fceaf2', 5, 'Finalmente entendi o sotaque de Manchester! Cara muito engraçado.', 'pt', current_date - 9)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000004000002', '00000000-0000-4000-8000-000000000004', 'Camila', 'https://api.dicebear.com/9.x/notionists/svg?seed=Camila-r&backgroundColor=fceaf2', 4, 'Ótimo para treinar listening com sotaque britânico.', 'pt', current_date - 15)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000004000003', '00000000-0000-4000-8000-000000000004', 'Pedro', 'https://api.dicebear.com/9.x/notionists/svg?seed=Pedro-r&backgroundColor=fceaf2', 5, 'Conversamos sobre bandas dos anos 90, foi demais.', 'pt', current_date - 21)
on conflict (id) do nothing;
insert into public.demo_hosts (id, display_name, age, country, city, timezone, languages, interests, categories, tagline, bio, photo_url, audio_cents_per_minute, video_cents_per_minute, call_types, is_online, availability, sort_order)
values ('00000000-0000-4000-8000-000000000005', 'Sofía', 29, 'Mexico', 'Guadalajara', 'America/Mexico_City', array['Spanish', 'English']::text[], array['Culinária', 'Salsa', 'Novelas', 'Plantas']::text[], array['language-exchange', 'making-friends', 'daily-life']::text[], 'Espanhol com uma chef mexicana que sempre tem uma história pra contar', 'Trabalho na cozinha de um restaurante em Guadalajara e nas minhas folgas dou aula de salsa. Adoro conhecer gente do Brasil, nossas culturas têm muita coisa em comum! A gente pode falar de receitas, de drama de família, da novela que eu estou viciada agora ou de qualquer coisa que te deixe à vontade para falar espanhol.', 'https://api.dicebear.com/9.x/notionists/svg?seed=Sof%C3%ADa-humi&backgroundColor=e5ddfb,fceaf2,ffe9d6', 70, 90, array['audio', 'video']::text[], true, '[{"day_of_week":0,"start_time":"16:00","end_time":"21:00","timezone":"America/Mexico_City"},{"day_of_week":2,"start_time":"16:00","end_time":"21:00","timezone":"America/Mexico_City"},{"day_of_week":4,"start_time":"16:00","end_time":"21:00","timezone":"America/Mexico_City"},{"day_of_week":6,"start_time":"16:00","end_time":"21:00","timezone":"America/Mexico_City"}]'::jsonb, 5)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000005000001', '00000000-0000-4000-8000-000000000005', 'Mariana', 'https://api.dicebear.com/9.x/notionists/svg?seed=Mariana-r&backgroundColor=fceaf2', 5, 'Ela é muito acolhedora, me senti à vontade desde o primeiro minuto.', 'pt', current_date - 10)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000005000002', '00000000-0000-4000-8000-000000000005', 'Gustavo', 'https://api.dicebear.com/9.x/notionists/svg?seed=Gustavo-r&backgroundColor=fceaf2', 5, 'Aprendi uma receita e um monte de vocabulário novo!', 'pt', current_date - 16)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000005000003', '00000000-0000-4000-8000-000000000005', 'Beatriz', 'https://api.dicebear.com/9.x/notionists/svg?seed=Beatriz-r&backgroundColor=fceaf2', 5, 'Divertidíssima. Já marquei outra conversa.', 'pt', current_date - 22)
on conflict (id) do nothing;
insert into public.demo_hosts (id, display_name, age, country, city, timezone, languages, interests, categories, tagline, bio, photo_url, audio_cents_per_minute, video_cents_per_minute, call_types, is_online, availability, sort_order)
values ('00000000-0000-4000-8000-000000000006', 'Lukas', 33, 'Germany', 'Hamburg', 'Europe/Berlin', array['German', 'English']::text[], array['Jogos de estratégia', 'Vela', 'História', 'Música eletrônica']::text[], array['gaming', 'hobbies', 'casual-conversation']::text[], 'Gamer de estratégia de Hamburgo: xadrez, Civilization e histórias de velejar', 'Desenvolvedor de software de dia, jogador de estratégia à noite. Falo com prazer de táticas de Civilization, de por que as aberturas no xadrez importam ou das palavras alemãs estranhas que não existem em nenhuma outra língua. Também velejo no rio Elba nos fins de semana e tenho histórias demais de me perder na neblina.', 'https://api.dicebear.com/9.x/notionists/svg?seed=Lukas-humi&backgroundColor=e5ddfb,fceaf2,ffe9d6', 110, null, array['audio']::text[], false, '[{"day_of_week":3,"start_time":"20:00","end_time":"23:30","timezone":"Europe/Berlin"},{"day_of_week":5,"start_time":"20:00","end_time":"23:30","timezone":"Europe/Berlin"},{"day_of_week":6,"start_time":"20:00","end_time":"23:30","timezone":"Europe/Berlin"}]'::jsonb, 6)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000006000001', '00000000-0000-4000-8000-000000000006', 'Vinícius', 'https://api.dicebear.com/9.x/notionists/svg?seed=Vin%C3%ADcius-r&backgroundColor=fceaf2', 5, 'Jogamos uma partida de xadrez online enquanto conversávamos. Muito bom!', 'pt', current_date - 11)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000006000002', '00000000-0000-4000-8000-000000000006', 'Rodrigo', 'https://api.dicebear.com/9.x/notionists/svg?seed=Rodrigo-r&backgroundColor=fceaf2', 4, 'Cara gente boa, conversa leve e interessante.', 'pt', current_date - 17)
on conflict (id) do nothing;
insert into public.demo_hosts (id, display_name, age, country, city, timezone, languages, interests, categories, tagline, bio, photo_url, audio_cents_per_minute, video_cents_per_minute, call_types, is_online, availability, sort_order)
values ('00000000-0000-4000-8000-000000000007', 'Amara', 26, 'Nigeria', 'Lagos', 'Africa/Lagos', array['English', 'Yoruba']::text[], array['Afrobeats', 'Moda', 'Startups', 'Filmes de Nollywood']::text[], array['music', 'movies-series', 'making-friends']::text[], 'A energia de Lagos: Afrobeats, Nollywood e vida de startup', 'Cuido das redes sociais de uma startup de moda em Lagos e estou sempre de olho no próximo hit de Afrobeats. Conversar com gente de outros países é o meu jeito favorito de relaxar: adoro comparar as cenas musicais, trocar indicação de filmes e ouvir como é o dia a dia em outro lugar.', 'https://api.dicebear.com/9.x/notionists/svg?seed=Amara-humi&backgroundColor=e5ddfb,fceaf2,ffe9d6', 80, 110, array['audio', 'video']::text[], true, '[{"day_of_week":1,"start_time":"18:00","end_time":"22:00","timezone":"Africa/Lagos"},{"day_of_week":2,"start_time":"18:00","end_time":"22:00","timezone":"Africa/Lagos"},{"day_of_week":3,"start_time":"18:00","end_time":"22:00","timezone":"Africa/Lagos"},{"day_of_week":4,"start_time":"18:00","end_time":"22:00","timezone":"Africa/Lagos"},{"day_of_week":5,"start_time":"18:00","end_time":"22:00","timezone":"Africa/Lagos"}]'::jsonb, 7)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000007000001', '00000000-0000-4000-8000-000000000007', 'Gabriela', 'https://api.dicebear.com/9.x/notionists/svg?seed=Gabriela-r&backgroundColor=fceaf2', 5, 'Me passou uma playlist inteira de Afrobeats. Que energia boa!', 'pt', current_date - 12)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000007000002', '00000000-0000-4000-8000-000000000007', 'Felipe', 'https://api.dicebear.com/9.x/notionists/svg?seed=Felipe-r&backgroundColor=fceaf2', 5, 'Ótima conversa sobre música e startups.', 'pt', current_date - 18)
on conflict (id) do nothing;
insert into public.demo_hosts (id, display_name, age, country, city, timezone, languages, interests, categories, tagline, bio, photo_url, audio_cents_per_minute, video_cents_per_minute, call_types, is_online, availability, sort_order)
values ('00000000-0000-4000-8000-000000000008', 'Chiara', 30, 'Italy', 'Bologna', 'Europe/Rome', array['Italian', 'English', 'Spanish']::text[], array['Massa caseira', 'Cinema', 'História da arte', 'Viagens de Vespa']::text[], array['travel-culture', 'movies-series', 'language-exchange']::text[], 'Italiano, cinema e os verdadeiros segredos da comida de Bolonha', 'Sou de Bolonha e trabalho num pequeno cinema de arte. Muitos brasileiros têm avós italianos e querem se reconectar com a língua, e eu adoro ajudar nisso. A gente pode falar de filmes, planejar a sua viagem dos sonhos pela Emília-Romanha ou discutir se abacaxi combina com pizza (não combina).', 'https://api.dicebear.com/9.x/notionists/svg?seed=Chiara-humi&backgroundColor=e5ddfb,fceaf2,ffe9d6', 100, 130, array['audio', 'video']::text[], false, '[{"day_of_week":2,"start_time":"18:30","end_time":"22:30","timezone":"Europe/Rome"},{"day_of_week":4,"start_time":"18:30","end_time":"22:30","timezone":"Europe/Rome"},{"day_of_week":6,"start_time":"18:30","end_time":"22:30","timezone":"Europe/Rome"}]'::jsonb, 8)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000008000001', '00000000-0000-4000-8000-000000000008', 'Renata', 'https://api.dicebear.com/9.x/notionists/svg?seed=Renata-r&backgroundColor=fceaf2', 5, 'Conversei em italiano pela primeira vez e ela foi muito paciente.', 'pt', current_date - 13)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000008000002', '00000000-0000-4000-8000-000000000008', 'Marcelo', 'https://api.dicebear.com/9.x/notionists/svg?seed=Marcelo-r&backgroundColor=fceaf2', 5, 'Indicou filmes ótimos e me ajudou a planejar a viagem.', 'pt', current_date - 19)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000008000003', '00000000-0000-4000-8000-000000000008', 'Paula', 'https://api.dicebear.com/9.x/notionists/svg?seed=Paula-r&backgroundColor=fceaf2', 4, 'Muito culta e simpática.', 'pt', current_date - 25)
on conflict (id) do nothing;
insert into public.demo_hosts (id, display_name, age, country, city, timezone, languages, interests, categories, tagline, bio, photo_url, audio_cents_per_minute, video_cents_per_minute, call_types, is_online, availability, sort_order)
values ('00000000-0000-4000-8000-000000000009', 'Daniel', 28, 'Portugal', 'Porto', 'Europe/Lisbon', array['Portuguese', 'English', 'French']::text[], array['Surfe', 'Fotografia', 'Fado', 'Corrida']::text[], array['casual-conversation', 'travel-culture', 'daily-life']::text[], 'Morador do Porto: surfe, fotografia e a vida real em Portugal', 'Sou fotógrafo no Porto e surfista sempre que o mar deixa. Muitos brasileiros falam comigo porque estão pensando em se mudar para Portugal, e eu adoro contar como é a vida de verdade por aqui: aluguel, trabalho, comida e as diferenças engraçadas entre o português daqui e o daí.', 'https://api.dicebear.com/9.x/notionists/svg?seed=Daniel-humi&backgroundColor=e5ddfb,fceaf2,ffe9d6', 50, 70, array['audio', 'video']::text[], true, '[{"day_of_week":0,"start_time":"19:00","end_time":"23:00","timezone":"Europe/Lisbon"},{"day_of_week":1,"start_time":"19:00","end_time":"23:00","timezone":"Europe/Lisbon"},{"day_of_week":3,"start_time":"19:00","end_time":"23:00","timezone":"Europe/Lisbon"},{"day_of_week":5,"start_time":"19:00","end_time":"23:00","timezone":"Europe/Lisbon"}]'::jsonb, 9)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000009000001', '00000000-0000-4000-8000-000000000009', 'Aline', 'https://api.dicebear.com/9.x/notionists/svg?seed=Aline-r&backgroundColor=fceaf2', 5, 'Me ajudou muito a entender como é morar em Portugal.', 'pt', current_date - 14)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000009000002', '00000000-0000-4000-8000-000000000009', 'Diego', 'https://api.dicebear.com/9.x/notionists/svg?seed=Diego-r&backgroundColor=fceaf2', 5, 'Conversa leve e muito informativa.', 'pt', current_date - 20)
on conflict (id) do nothing;
insert into public.demo_hosts (id, display_name, age, country, city, timezone, languages, interests, categories, tagline, bio, photo_url, audio_cents_per_minute, video_cents_per_minute, call_types, is_online, availability, sort_order)
values ('00000000-0000-4000-8000-000000000010', 'Hana', 25, 'South Korea', 'Busan', 'Asia/Seoul', array['Korean', 'English']::text[], array['Doramas', 'Skincare', 'Confeitaria', 'Caminhadas na praia']::text[], array['movies-series', 'making-friends', 'hobbies']::text[], 'Doramas, confeitaria e a vida à beira-mar em Busan', 'Sou confeiteira em Busan e meu segundo emprego é indicar doramas para todo mundo que eu conheço. Se você está aprendendo coreano ou só tem curiosidade sobre a cultura da Coreia além do que viraliza, vamos conversar! Posso te ensinar algumas frases úteis, e sempre quero saber o que os brasileiros acham da comida coreana.', 'https://api.dicebear.com/9.x/notionists/svg?seed=Hana-humi&backgroundColor=e5ddfb,fceaf2,ffe9d6', 90, 120, array['audio', 'video']::text[], false, '[{"day_of_week":5,"start_time":"10:00","end_time":"14:00","timezone":"Asia/Seoul"},{"day_of_week":6,"start_time":"10:00","end_time":"14:00","timezone":"Asia/Seoul"},{"day_of_week":0,"start_time":"10:00","end_time":"14:00","timezone":"Asia/Seoul"}]'::jsonb, 10)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000010000001', '00000000-0000-4000-8000-000000000010', 'Isabela', 'https://api.dicebear.com/9.x/notionists/svg?seed=Isabela-r&backgroundColor=fceaf2', 5, 'Ela é um amor! Falamos de doramas por meia hora.', 'pt', current_date - 15)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000010000002', '00000000-0000-4000-8000-000000000010', 'Letícia', 'https://api.dicebear.com/9.x/notionists/svg?seed=Let%C3%ADcia-r&backgroundColor=fceaf2', 5, 'Aprendi a me apresentar em coreano. Muito divertido!', 'pt', current_date - 21)
on conflict (id) do nothing;
insert into public.demo_hosts (id, display_name, age, country, city, timezone, languages, interests, categories, tagline, bio, photo_url, audio_cents_per_minute, video_cents_per_minute, call_types, is_online, availability, sort_order)
values ('00000000-0000-4000-8000-000000000011', 'Noah', 38, 'United States', 'Austin', 'America/Chicago', array['English', 'Spanish']::text[], array['Churrasco texano', 'Shows ao vivo', 'Corrida', 'Finanças pessoais']::text[], array['english-practice', 'daily-life', 'other-interests']::text[], 'Inglês americano para o trabalho e o dia a dia, do jeito texano', 'Há dez anos gerencio equipes remotas, muitas delas na América Latina, então sei qual é o inglês que você realmente precisa em reuniões, entrevistas e no papo com os colegas. Fora do trabalho é churrasco, música ao vivo na 6th Street e treino para a próxima meia maratona. Se ajudar, a gente simula uma entrevista de emprego!', 'https://api.dicebear.com/9.x/notionists/svg?seed=Noah-humi&backgroundColor=e5ddfb,fceaf2,ffe9d6', 150, 200, array['audio', 'video']::text[], true, '[{"day_of_week":1,"start_time":"19:00","end_time":"22:00","timezone":"America/Chicago"},{"day_of_week":2,"start_time":"19:00","end_time":"22:00","timezone":"America/Chicago"},{"day_of_week":3,"start_time":"19:00","end_time":"22:00","timezone":"America/Chicago"},{"day_of_week":4,"start_time":"19:00","end_time":"22:00","timezone":"America/Chicago"}]'::jsonb, 11)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000011000001', '00000000-0000-4000-8000-000000000011', 'Leandro', 'https://api.dicebear.com/9.x/notionists/svg?seed=Leandro-r&backgroundColor=fceaf2', 5, 'Simulamos uma entrevista de emprego em inglês. Valeu cada minuto.', 'pt', current_date - 16)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000011000002', '00000000-0000-4000-8000-000000000011', 'Carla', 'https://api.dicebear.com/9.x/notionists/svg?seed=Carla-r&backgroundColor=fceaf2', 5, 'Muito profissional e gentil. Me ajudou a me preparar para uma reunião.', 'pt', current_date - 22)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000011000003', '00000000-0000-4000-8000-000000000011', 'André', 'https://api.dicebear.com/9.x/notionists/svg?seed=Andr%C3%A9-r&backgroundColor=fceaf2', 4, 'Ótimo para inglês de trabalho.', 'pt', current_date - 28)
on conflict (id) do nothing;
insert into public.demo_hosts (id, display_name, age, country, city, timezone, languages, interests, categories, tagline, bio, photo_url, audio_cents_per_minute, video_cents_per_minute, call_types, is_online, availability, sort_order)
values ('00000000-0000-4000-8000-000000000012', 'Inès', 23, 'France', 'Lyon', 'Europe/Paris', array['French', 'English', 'Portuguese']::text[], array['Literatura', 'Escalada', 'Arte de rua', 'Cafés']::text[], array['language-exchange', 'hobbies', 'casual-conversation']::text[], 'Francês com uma estudante de Lyon que ama livros e escalada', 'Estudo literatura em Lyon e aprendo português há um ano. Até fiz um semestre em São Paulo! A gente pode fazer metade em francês e metade em português, assim nós dois praticamos. Adoro falar de livros, paredes de escalada, arte de rua e da cultura dos cafés que faz os franceses almoçarem por duas horas.', 'https://api.dicebear.com/9.x/notionists/svg?seed=In%C3%A8s-humi&backgroundColor=e5ddfb,fceaf2,ffe9d6', 60, 80, array['audio', 'video']::text[], true, '[{"day_of_week":0,"start_time":"18:00","end_time":"22:00","timezone":"Europe/Paris"},{"day_of_week":2,"start_time":"18:00","end_time":"22:00","timezone":"Europe/Paris"},{"day_of_week":3,"start_time":"18:00","end_time":"22:00","timezone":"Europe/Paris"},{"day_of_week":5,"start_time":"18:00","end_time":"22:00","timezone":"Europe/Paris"}]'::jsonb, 12)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000012000001', '00000000-0000-4000-8000-000000000012', 'Júlia', 'https://api.dicebear.com/9.x/notionists/svg?seed=J%C3%BAlia-r&backgroundColor=fceaf2', 5, 'Fizemos metade em francês e metade em português. Adorei!', 'pt', current_date - 17)
on conflict (id) do nothing;
insert into public.demo_reviews (id, demo_host_id, reviewer_name, reviewer_avatar_url, rating, comment, language, review_date)
values ('00000000-0000-4000-9000-000012000002', '00000000-0000-4000-8000-000000000012', 'Henrique', 'https://api.dicebear.com/9.x/notionists/svg?seed=Henrique-r&backgroundColor=fceaf2', 5, 'Muito simpática e paciente com meu francês enferrujado.', 'pt', current_date - 23)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
