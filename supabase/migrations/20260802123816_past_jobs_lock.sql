-- Load complete. Remove the temporary insert policy so past_jobs is fully locked.
-- No anon policies remain: historical customer data is now private (secret key only).
drop policy if exists "temp load past_jobs" on past_jobs;
