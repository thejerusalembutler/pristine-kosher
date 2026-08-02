-- Workers (authenticated, role=worker) can read ONLY their own record and their own jobs.
-- Staff policies (broad authenticated read) already exist; these ADD worker-scoped access.
-- Since a worker is also 'authenticated', the existing broad staff policies would let them
-- see everything — so we must scope by user metadata. We restrict via the linked user_id.

-- A worker can read only the worker row linked to their login
create policy "worker reads own record" on workers for select to authenticated
  using ( user_id = auth.uid() );

-- A worker can read only bookings assigned to them
create policy "worker reads own jobs" on bookings for select to authenticated
  using ( assigned_worker_id in (select id from workers where user_id = auth.uid()) );

-- A worker can update only their own jobs (completion, payment, hours, arrival)
create policy "worker updates own jobs" on bookings for update to authenticated
  using ( assigned_worker_id in (select id from workers where user_id = auth.uid()) )
  with check ( assigned_worker_id in (select id from workers where user_id = auth.uid()) );
