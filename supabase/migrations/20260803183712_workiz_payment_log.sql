-- Idempotency log: one row per money event already mirrored to Workiz,
-- so a retry can never record the same payment twice.
create table if not exists workiz_payment_log (
  id            bigint generated always as identity primary key,
  booking_id    uuid not null,
  event_key     text not null,          -- e.g. 'deposit', 'balance', 'offline:<n>', 'discount'
  workiz_payment_id text,               -- id returned by Workiz
  amount        numeric,
  created_at    timestamptz default now(),
  unique(booking_id, event_key)         -- the guardrail: same event can't log twice
);
alter table workiz_payment_log enable row level security;
