-- Discounts (dollar or percent) and offline payment tracking per booking.
alter table bookings add column if not exists discount_type text;      -- 'amount' or 'percent'
alter table bookings add column if not exists discount_value numeric default 0;
-- offline payments (Zelle/cash/check) recorded on the booking, beyond deposit + card
alter table bookings add column if not exists offline_paid numeric default 0;
alter table bookings add column if not exists offline_method text;     -- zelle / cash / check / mixed
alter table bookings add column if not exists paid_in_full boolean default false;
