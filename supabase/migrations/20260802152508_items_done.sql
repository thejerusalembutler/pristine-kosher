-- Which ordered items the worker checked off as completed
alter table bookings add column if not exists items_done jsonb;   -- e.g. ["stovetop","microwave"]
-- worker_notes already exists (extra work done); ensure it's there
alter table bookings add column if not exists worker_notes text;
