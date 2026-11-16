# HUMI — Real people. Real connections.

A global marketplace for paid conversations and shared social experiences between adults (18+).

The app runs in two modes:

| Mode | When | What happens |
| --- | --- | --- |
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set | Real accounts, real host profiles, bookings saved to Postgres, protected routes |
| **Demo** | Those variables are missing | Bundled sample hosts and a local mock login, clearly labelled as demo |

Payments are **always test mode** for now: every booking gets a `payments` row with status `demo`, nothing is charged, and the UI says so.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm run db:test      # runs the SQL migration + 57 RLS/business-rule checks in an in-memory Postgres
```

## Connect Supabase (step by step)

1. **Create a project** at supabase.com → New project.
2. **Run the migration.** Dashboard → **SQL Editor** → **New query** → paste the entire file
   `supabase/migrations/20261114120000_humi_initial_schema.sql` → **Run**. It should end with "Success. No rows returned".
   Run it **once** on an empty project (it creates types/tables and will error if they already exist).
   With the Supabase CLI you can instead run `supabase link` then `supabase db push`.
3. **Environment variables.** Copy `.env.example` to `.env.local` and fill in from Dashboard → **Project Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the `anon` / publishable key (safe in the browser; RLS protects data)
   - `NEXT_PUBLIC_SITE_URL` — `http://localhost:3000` locally, your real domain in production
   - `SUPABASE_SERVICE_ROLE_KEY` — optional, only for the local seed script. Never expose it to the browser or commit it.
4. **Auth URLs.** Dashboard → **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (your domain in production)
   - Redirect URLs: add `http://localhost:3000/auth/callback` (and `https://your-domain/auth/callback`)
5. **Restart** `npm run dev` so Next.js picks up the new env vars.
6. **Optional — sample hosts:** `npm run db:seed` creates the 14 fictional hosts (flagged `is_sample`, shown with a "Sample" badge, no fake ratings).
   Remove them before launch with `npm run db:seed -- --remove`.

Email confirmation is on by default in Supabase, so new users must click the link in their inbox. Supabase's built-in email
sender is rate-limited and meant for testing — configure custom SMTP (Authentication → Emails) before real users arrive.

## Google & Apple sign-in

The buttons and callback are ready; providers must be switched on manually. Step-by-step guide (in Portuguese): [docs/LOGIN_SOCIAL.md](docs/LOGIN_SOCIAL.md).

## How the data is protected

- **RLS on every table.** Users read/update only their own `profiles`; hosts only their own `host_profiles` and availability;
  bookings are visible to their customer and host only; `payments` only to the paying customer.
- **Column-level grants.** Users can't change their `role`; hosts can't set `is_verified`, ratings or session counts.
- **Public data goes through views only.** `public_hosts` and `public_reviews` expose whitelisted columns (no emails, last names or user ids).
  `my_host_bookings` gives hosts a booking list with the guest's first name and country only.
- **Prices are computed in the database.** The `bookings_before_insert` trigger ignores any price the client sends, recalculates
  subtotal / fee / host earnings from the host's current rate, checks the slot is inside the host's availability, at least 30 minutes ahead,
  and not overlapping another booking (an exclusion constraint guarantees no double-booking).
- **Status changes** go through `confirm_booking`, `cancel_booking`, `complete_booking` (clients have no UPDATE on bookings).
- **Reviews** can only be written by the customer of a *completed* booking, once per booking; host ratings update automatically.
- New sign-ups get a profile via the `handle_new_user` trigger; `role` can be `customer` or `host` (never `admin`).

## Structure

```
supabase/
  migrations/          SQL schema, RLS, functions, views
  tests/               PGlite test suite for the migration (npm run db:test)
scripts/seed.mts       Optional sample-host seeding (service role, local only)
src/
  app/                 Routes; auth/callback handles email links; reset-password page
  middleware.ts        Refreshes the Supabase session, protects /account, /dashboard, /become-a-host/apply
  lib/supabase/        config.ts (mode switch), client.ts (browser), server.ts (server + public clients)
  lib/data/hosts.ts    Marketplace queries → app `Host` shape (Supabase or sample data)
  lib/auth.tsx         Auth context: Supabase Auth or demo mock behind one API
  lib/time.ts          Time-zone helpers for slots (host zone ↔ UTC)
  types/database.ts    Supabase Database types (regenerate with `supabase gen types`)
  components/
    account/           Live member account (bookings, cancel, reviews, profile)
    dashboard/         HostDashboard (demo) + LiveHostDashboard (Supabase)
    booking/ explore/ hosts/ home/ profile/ auth/ ui/ layout/ brand/
  data/                Sample hosts and demo data
  i18n/                Dictionary-based copy (en; add pt.ts for Portuguese)
```

## Still to build before a public launch

- **Payments** — Stripe (or similar) checkout via a server route/Edge Function that creates the payment intent, plus a webhook that
  updates `payments.status` with the service role. Host payouts via Stripe Connect.
- **Identity & age verification** — a provider that sets `host_profiles.is_verified` (service role / admin only).
- **Audio/video sessions** — e.g. LiveKit, Daily or Twilio, gated on confirmed bookings.
- **Photo uploads** — Supabase Storage bucket for avatars (currently an https URL field).
- **Notifications** — emails to hosts on new booking requests and to customers on confirmation.
- **Moderation** — persist reports/blocks, an admin area (the `admin` role and `is_admin()` already exist).
- **Server-side Explore filtering** — the page loads up to 200 published hosts and filters in the browser; move filters into the query (indexes exist) as the catalogue grows.
- **Portuguese**, legal review of the draft policies, and account deletion (bookings/payments keep `on delete restrict` for financial records).
