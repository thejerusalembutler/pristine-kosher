-- SECURITY FIX: staff and workers are both 'authenticated'. The broad staff read
-- policies would let workers read everything. Scope staff policies to REAL staff:
-- a user is "staff" if they are NOT linked to any worker record.
-- (Workers have a workers.user_id = their uid; staff do not.)

-- helper: is the current user a worker? (linked to a worker row)
create or replace function public.is_worker() returns boolean
  language sql stable security definer set search_path = public as $$
    select exists(select 1 from workers where user_id = auth.uid());
$$;

-- Replace broad staff read policies with staff-only (NOT a worker) versions
drop policy if exists "staff read bookings" on bookings;
create policy "staff read bookings" on bookings for select to authenticated
  using ( not public.is_worker() );

drop policy if exists "staff read workers" on workers;
create policy "staff read workers" on workers for select to authenticated
  using ( not public.is_worker() );

drop policy if exists "staff read applications" on applications;
create policy "staff read applications" on applications for select to authenticated
  using ( not public.is_worker() );

drop policy if exists "staff write bookings u" on bookings;
create policy "staff write bookings u" on bookings for update to authenticated
  using ( not public.is_worker() ) with check ( not public.is_worker() );
