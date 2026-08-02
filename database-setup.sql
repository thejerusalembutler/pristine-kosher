-- =====================================================================
--  Pristine Kosher — Full database structure
--  Tables: markets, workers, worker_markets (link), applications, bookings
--  Safe to run once. Extends the existing `bookings` table without dropping it.
-- =====================================================================

-- ---------- 1. MARKETS: your territories ----------
create table if not exists markets (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  name            text not null unique,     -- e.g. "Lakewood, NJ"
  region_note     text,                     -- e.g. "Passaic, Teaneck & surrounding"
  planned_workers int default 0             -- your seasonal staffing plan
);

-- ---------- 2. WORKERS: your crew (approved applicants) ----------
create table if not exists workers (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz default now(),
  name               text not null,
  phone              text,
  email              text,
  home_base          text,                  -- where they start their day
  hourly_rate        int default 30,        -- $30-35 typical
  has_car            boolean default true,
  travel_flexibility text default 'medium', -- low / medium / high
  availability       jsonb,                 -- days/hours they can work
  status             text default 'active', -- active / inactive
  application_id     uuid                   -- links back to the application they came from
);

-- ---------- 3. WORKER_MARKETS: the many-to-many link ----------
-- One row per (worker, market) pair, so a worker can serve several markets
-- and a market can have several workers.
create table if not exists worker_markets (
  worker_id uuid references workers(id) on delete cascade,
  market_id uuid references markets(id) on delete cascade,
  primary key (worker_id, market_id)
);

-- ---------- 4. APPLICATIONS: raw worker applications ----------
create table if not exists applications (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz default now(),
  status           text default 'pending',   -- pending / approved / declined
  full_name        text,
  dob              date,
  phone            text,
  email            text,
  address          text,
  emergency        jsonb,                    -- name, relationship, phone
  market           text,                     -- preferred market (text; matched to a market on approval)
  has_car          boolean,
  communication    text,                     -- whatsapp / sms
  yeshiva          text,
  is_returning     boolean default false,   -- renamed: "returning" is a reserved SQL word
  prior_years      text,
  availability     jsonb,                    -- the calendar: {date: {state,start,end}}
  full_days        int default 0,
  part_days        int default 0,
  est_hours        int default 0,
  photo            text,                     -- filename (real file handled later)
  w9_agreed        boolean default false,
  signature        text,
  signed_date      text
);

-- ---------- 5. BOOKINGS: extend the existing table ----------
-- These columns are the relationships the AI scheduler needs.
alter table bookings add column if not exists market_id         uuid references markets(id);
alter table bookings add column if not exists assigned_worker_id uuid references workers(id);
-- ^ assigned_worker_id starts empty; the AI/scheduler fills it in later.

-- =====================================================================
--  SECURITY POLICIES (Row Level Security)
--  Public (anon) can: submit bookings, submit applications, read markets.
--  Everything sensitive (workers, reading applications) will move behind a
--  login later; for now the dashboard reads them with the publishable key.
-- =====================================================================

alter table markets        enable row level security;
alter table workers        enable row level security;
alter table worker_markets enable row level security;
alter table applications   enable row level security;

-- MARKETS: anyone can read (booking form needs the list); no public writes.
drop policy if exists "read markets" on markets;
create policy "read markets" on markets for select to anon using (true);

-- APPLICATIONS: anyone can submit; dashboard can read (temporary, pre-login).
drop policy if exists "submit application" on applications;
create policy "submit application" on applications for insert to anon with check (true);
drop policy if exists "read applications" on applications;
create policy "read applications" on applications for select to anon using (true);
drop policy if exists "update application" on applications;
create policy "update application" on applications for update to anon using (true);

-- WORKERS: dashboard can read + write (temporary, pre-login).
drop policy if exists "read workers" on workers;
create policy "read workers" on workers for select to anon using (true);
drop policy if exists "write workers" on workers;
create policy "write workers" on workers for insert to anon with check (true);
drop policy if exists "update workers" on workers;
create policy "update workers" on workers for update to anon using (true);

-- WORKER_MARKETS: dashboard can read + write the links.
drop policy if exists "read worker_markets" on worker_markets;
create policy "read worker_markets" on worker_markets for select to anon using (true);
drop policy if exists "write worker_markets" on worker_markets;
create policy "write worker_markets" on worker_markets for insert to anon with check (true);

-- =====================================================================
--  SEED: load your 16 markets with planned worker counts
-- =====================================================================
insert into markets (name, region_note, planned_workers) values
  ('Toronto', null, 1),
  ('Cleveland', null, 2),
  ('Detroit', null, 1),
  ('Chicago', null, 2),
  ('Muncie', null, 5),
  ('North Jersey', 'Passaic, Teaneck & surrounding North Jersey', 3),
  ('Lakewood, NJ', null, 5),
  ('Brooklyn, NY', null, 4),
  ('Five Towns, NY', null, 5),
  ('Queens, NY', null, 2),
  ('Baltimore, MD', null, 2),
  ('Silver Spring, MD', null, 1),
  ('Atlanta, GA', null, 1),
  ('South Florida', 'Boca Raton, N. Miami Beach, Hollywood, Boynton Beach, W. Palm Beach, Miami Beach', 5),
  ('Orlando, FL', null, 5),
  ('Los Angeles, CA', null, 1)
on conflict (name) do nothing;
