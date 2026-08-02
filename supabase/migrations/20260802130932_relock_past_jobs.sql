-- SECURITY FIX: remove the temporary policies that were exposing customer data.
-- The geocoding is done, so anon no longer needs any access to the raw table.
-- Customer names + addresses become private again; the map uses the safe view only.
drop policy if exists "temp geocode past_jobs" on past_jobs;
drop policy if exists "temp geocode update" on past_jobs;
