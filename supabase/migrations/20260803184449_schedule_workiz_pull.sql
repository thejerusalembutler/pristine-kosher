-- Schedule the Workiz jobs pull every 10 minutes, so changes made in Workiz
-- (job marked Done, worker reassigned, schedule moved) flow into the app on their own.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('workiz-pull-sweep') where exists (select 1 from cron.job where jobname='workiz-pull-sweep');

select cron.schedule(
  'workiz-pull-sweep',
  '*/10 * * * *',   -- every 10 minutes
  $$
  select net.http_post(
    url := 'https://qkgdobpazyoxesyiznus.supabase.co/functions/v1/workiz-pull-jobs',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_cjaMPpEPhe-HxUd616SSRg_ShraAso2"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
