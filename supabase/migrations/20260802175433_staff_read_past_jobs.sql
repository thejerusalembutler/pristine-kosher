-- Ensure logged-in STAFF can read past job history (for customer profiles).
-- (It was locked to no-read; staff need it. Workers still cannot see it.)
drop policy if exists "staff read past_jobs" on past_jobs;
create policy "staff read past_jobs" on past_jobs for select to authenticated
  using ( not public.is_worker() );
grant select on past_jobs to authenticated;
