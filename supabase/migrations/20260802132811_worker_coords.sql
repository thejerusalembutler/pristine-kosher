-- Coordinates for workers (their home base) so the scheduler can measure distance
alter table workers add column if not exists lat numeric;
alter table workers add column if not exists lng numeric;
