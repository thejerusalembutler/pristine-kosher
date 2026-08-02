-- Track the worker's last arrival-status update to the customer
alter table bookings add column if not exists arrival_status text;      -- omw / ontime / late15
alter table bookings add column if not exists arrival_status_at timestamptz;
