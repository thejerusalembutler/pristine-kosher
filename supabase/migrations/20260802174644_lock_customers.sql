-- Import done — remove the temporary public insert policy. Customers table is now staff-only.
drop policy if exists "temp import customers" on customers;
revoke insert, update, delete on customers from anon;
