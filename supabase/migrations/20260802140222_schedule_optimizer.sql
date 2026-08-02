-- Schedule the route optimizer. Fires every 20 minutes; the function itself
-- throttles to once-a-day off-season and every-run during the crunch (from Mar 31).
-- Uses pg_cron + pg_net (Supabase extensions).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- remove any prior schedule of the same name, then create it
select cron.unschedule('optimize-routes-sweep') where exists (select 1 from cron.job where jobname='optimize-routes-sweep');

select cron.schedule(
  'optimize-routes-sweep',
  '*/20 * * * *',   -- every 20 minutes
  $$
  select net.http_post(
    url := 'https://qkgdobpazyoxesyiznus.supabase.co/functions/v1/optimize-routes',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_cjaMPpEPhe-HxUd616SSRg_ShraAso2"}'::jsonb
  );
  $$
);
