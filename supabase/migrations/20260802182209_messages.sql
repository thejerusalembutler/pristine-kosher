-- Two-way SMS conversation log. One row per message (in or out).
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  phone text not null,              -- the customer's phone (normalized)
  direction text not null,          -- 'in' (from customer) or 'out' (from us)
  body text,
  customer_name text,               -- best-known name for this phone
  staff_email text,                 -- who sent it (for outgoing)
  twilio_sid text
);
create index if not exists messages_phone_idx on messages(phone);
alter table messages enable row level security;
-- staff can read + insert (send); workers cannot
create policy "staff read messages" on messages for select to authenticated using ( not public.is_worker() );
create policy "staff send messages" on messages for insert to authenticated with check ( not public.is_worker() );
