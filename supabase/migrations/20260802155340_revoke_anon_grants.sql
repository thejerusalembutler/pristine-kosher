-- The anon role has broad table GRANTS (default in some setups). Revoke destructive ones.
-- Keep: anon can INSERT bookings/applications (public forms), SELECT markets.
-- Remove: anon DELETE and UPDATE on customer tables.

revoke delete on bookings from anon;
revoke update on bookings from anon;
revoke delete on applications from anon;
revoke delete on workers from anon;
revoke delete on markets from anon;
revoke delete on routes from anon;
revoke delete, update on past_jobs from anon;

-- keep inserts working
grant insert on bookings to anon;
grant insert on applications to anon;
grant select on markets to anon;
