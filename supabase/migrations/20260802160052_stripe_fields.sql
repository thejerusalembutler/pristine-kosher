-- Stripe payment tracking on bookings (no card numbers ever stored — only Stripe tokens).
alter table bookings add column if not exists stripe_customer_id text;   -- Stripe customer (holds their saved card)
alter table bookings add column if not exists stripe_payment_method text; -- saved card token (pm_...)
alter table bookings add column if not exists deposit_paid numeric default 0;  -- deposit charged at booking
alter table bookings add column if not exists deposit_status text;         -- 'paid' / 'failed' / null
alter table bookings add column if not exists balance_charged numeric default 0;  -- charged later from saved card
alter table bookings add column if not exists card_last4 text;             -- last 4 digits (for display only, safe)
