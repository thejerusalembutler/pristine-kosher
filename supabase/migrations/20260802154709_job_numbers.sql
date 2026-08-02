-- Auto-incrementing job number for every booking (like Workiz: 5292, 5293, ...).
-- Start the sequence above your last Workiz number so there's no overlap.
create sequence if not exists job_number_seq start with 5300;
alter table bookings add column if not exists job_number int;

-- default new bookings to the next number
alter table bookings alter column job_number set default nextval('job_number_seq');

-- backfill existing bookings that don't have one
update bookings set job_number = nextval('job_number_seq') where job_number is null;
