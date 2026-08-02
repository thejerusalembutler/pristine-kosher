-- LOCK IT DOWN: remove PUBLIC (anon) read access to customer/operational data.
-- Logged-in staff keep read access (added in previous migration). Public keeps
-- only what it needs: submitting bookings/applications, and reading the markets list.

-- bookings: drop anon read + anon update (staff-authenticated versions remain)
drop policy if exists "Dashboard can read bookings" on bookings;
drop policy if exists "update bookings" on bookings;
-- KEEP: "Anyone can submit a booking" (insert) so the public form still works.

-- applications: drop anon read + anon update (keep public insert)
drop policy if exists "read applications" on applications;
drop policy if exists "update application" on applications;
-- KEEP: "submit application" (insert) so the public application form still works.

-- workers / worker_markets: drop anon read + anon writes (staff versions remain)
drop policy if exists "read workers" on workers;
drop policy if exists "write workers" on workers;
drop policy if exists "update workers" on workers;
drop policy if exists "read worker_markets" on worker_markets;
drop policy if exists "write worker_markets" on worker_markets;

-- routes: drop anon read (staff version remains)
drop policy if exists "read routes" on routes;

-- markets: KEEP public read (the booking form needs the market list) — do nothing.
