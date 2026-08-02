-- Worker completion + payment tracking on each booking
alter table bookings add column if not exists completed boolean default false;
alter table bookings add column if not exists completed_at timestamptz;
alter table bookings add column if not exists payment_method text;   -- zelle / cash / check / cc_office / unpaid
alter table bookings add column if not exists payment_note text;
alter table bookings add column if not exists worker_notes text;     -- anything the worker reports
