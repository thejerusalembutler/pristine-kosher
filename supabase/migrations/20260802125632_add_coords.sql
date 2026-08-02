-- Add coordinate columns for geocoded addresses
alter table past_jobs add column if not exists lat numeric;
alter table past_jobs add column if not exists lng numeric;
alter table past_jobs add column if not exists geocode_status text;
-- also add to live bookings for future use
alter table bookings add column if not exists lat numeric;
alter table bookings add column if not exists lng numeric;
-- temporary: allow updating past_jobs to write coordinates (dropped after)
create policy "temp geocode past_jobs" on past_jobs for select to anon using (true);
create policy "temp geocode update" on past_jobs for update to anon using (true);
