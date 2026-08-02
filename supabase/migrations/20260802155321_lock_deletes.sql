-- SECURITY FIX: ensure DELETE is never allowed for the public (anon).
-- With RLS enabled and no anon delete policy, deletes should be denied — but let's be
-- explicit and also confirm RLS is forced. Only staff (authenticated non-worker) may delete.

-- make sure RLS is enabled on bookings (it should be, but enforce it)
alter table bookings enable row level security;
alter table bookings force row level security;

-- explicit: only staff can delete bookings
drop policy if exists "staff delete bookings" on bookings;
create policy "staff delete bookings" on bookings for delete to authenticated
  using ( not public.is_worker() );

-- (no anon delete policy exists, so with RLS forced, anon deletes are denied)
