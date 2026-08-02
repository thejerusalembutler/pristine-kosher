-- Let LOGGED-IN staff (role: authenticated) read the operational tables.
-- (Public/anon read policies are still in place for now; we remove those in the next step.)
create policy "staff read bookings"       on bookings       for select to authenticated using (true);
create policy "staff read workers"        on workers        for select to authenticated using (true);
create policy "staff read applications"   on applications   for select to authenticated using (true);
create policy "staff read markets"        on markets        for select to authenticated using (true);
create policy "staff read worker_markets" on worker_markets for select to authenticated using (true);
create policy "staff read routes"         on routes         for select to authenticated using (true);

-- staff can also update/insert (assign workers, change status, record payments, etc.)
create policy "staff write bookings u"    on bookings       for update to authenticated using (true) with check (true);
create policy "staff write applications u" on applications  for update to authenticated using (true) with check (true);
create policy "staff write workers i"     on workers        for insert to authenticated with check (true);
create policy "staff write workers u"     on workers        for update to authenticated using (true) with check (true);
create policy "staff write worker_markets i" on worker_markets for insert to authenticated with check (true);
