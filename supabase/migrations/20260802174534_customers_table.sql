-- A permanent customer directory (imported from Workiz). Private — staff only.
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  first_name text,
  last_name text,
  full_name text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  source text default 'workiz_import',
  marketing_ok boolean default false   -- consent flag for future email/SMS blasts
);
alter table customers enable row level security;
-- staff (non-worker authenticated) can read/write; import happens server-side or via temp policy
create policy "staff read customers" on customers for select to authenticated using ( not public.is_worker() );
create policy "staff write customers" on customers for insert to authenticated with check ( not public.is_worker() );
create policy "staff update customers" on customers for update to authenticated using ( not public.is_worker() );

-- temporary: allow bulk import via the publishable key (dropped right after)
create policy "temp import customers" on customers for insert to anon with check (true);
