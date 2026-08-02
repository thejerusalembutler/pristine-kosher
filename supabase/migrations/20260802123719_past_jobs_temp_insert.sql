-- Temporary: allow anon insert so we can bulk-load the historical data once.
-- Will be DROPPED immediately after loading (see next migration).
create policy "temp load past_jobs" on past_jobs for insert to anon with check (true);
