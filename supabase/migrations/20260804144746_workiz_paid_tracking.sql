-- Track how much Workiz says has been collected on a job, so payments taken
-- directly in Workiz can be detected on pull and reflected in the app.
alter table bookings add column if not exists workiz_collected numeric default 0;   -- last-seen total collected per Workiz (total - amountDue)
alter table bookings add column if not exists workiz_extra_paid numeric default 0;  -- payments that originated in Workiz (not from the app)
