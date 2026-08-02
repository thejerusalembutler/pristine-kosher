-- Historical jobs from Workiz (2026 season). RLS ON, NO public policies —
-- this holds real customer names + addresses, reachable only with the secret key.
create table if not exists past_jobs (
  id          uuid primary key default gen_random_uuid(),
  job_number  int,
  client      text,
  job_type    text,
  scheduled   timestamptz,
  scheduled_raw text,
  tech        text,
  created_by  text,
  address     text,
  city        text,
  state       text,
  zip         text,
  service_area text,
  service_area_clean text,   -- normalized market name
  total       numeric,
  season      text default '2026'
);
alter table past_jobs enable row level security;
-- No anon policies on purpose: historical customer data stays private.
