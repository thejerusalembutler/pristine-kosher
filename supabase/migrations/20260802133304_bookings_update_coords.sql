-- Ensure anon can UPDATE bookings (needed for status changes, worker assignment,
-- and saving geocoded lat/lng). A permissive update policy with USING+WITH CHECK.
drop policy if exists "update bookings" on bookings;
create policy "update bookings" on bookings for update to anon using (true) with check (true);
