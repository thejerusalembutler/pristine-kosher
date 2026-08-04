-- Workiz two-way sync: matching pins + sync status + AI lock
alter table bookings add column if not exists workiz_job_id text;
alter table bookings add column if not exists workiz_sync_status text default 'pending';
alter table bookings add column if not exists workiz_synced_at timestamptz;
alter table bookings add column if not exists ai_locked boolean default false;
alter table bookings add column if not exists ai_locked_reason text;
alter table workers  add column if not exists workiz_tech_id text;
create index if not exists idx_bookings_workiz_job on bookings(workiz_job_id);
create index if not exists idx_bookings_sync_status on bookings(workiz_sync_status);
