-- Link a worker record to their Supabase auth login (so a worker sees only their jobs).
alter table workers add column if not exists user_id uuid;   -- = auth.users.id of their login

-- Hours + payment tracking columns on bookings (per-job, filled by the worker):
alter table bookings add column if not exists work_minutes int;      -- kitchen work time
alter table bookings add column if not exists drive_minutes int;     -- driving time to this job
alter table bookings add column if not exists cash_collected numeric default 0;   -- cash/check amount in hand
