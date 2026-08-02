-- A SAFE, coordinates-only public view of past jobs for the map.
-- Exposes NO customer names or street addresses — only what a dot on a map needs.
create or replace view past_jobs_map as
  select service_area_clean, tech, scheduled_raw, lat, lng, total
  from past_jobs
  where geocode_status = 'ok';

-- allow anon to read the safe view only
grant select on past_jobs_map to anon;
