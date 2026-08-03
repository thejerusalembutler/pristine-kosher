-- How the customer heard about us (marketing attribution)
alter table bookings add column if not exists referral_source text;
