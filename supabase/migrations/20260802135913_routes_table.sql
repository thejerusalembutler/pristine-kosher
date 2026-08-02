-- Stores the latest optimized route per worker per day.
create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references workers(id) on delete cascade,
  service_date date not null,
  stop_order jsonb,        -- ordered list of booking ids
  total_minutes int,
  total_miles numeric,
  locked boolean default false,     -- true once inside 12-hr window
  optimized_at timestamptz default now(),
  unique(worker_id, service_date)
);
alter table routes enable row level security;
-- dashboard/worker pages can read routes
create policy "read routes" on routes for select to anon using (true);

-- track when a booking was last routed, so the sweep knows what changed
alter table bookings add column if not exists routed_at timestamptz;
