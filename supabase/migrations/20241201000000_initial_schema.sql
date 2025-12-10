-- Cafe Cursor - Initial Database Schema
-- Creates base tables for attendees and coupon codes

-- Create coupon_codes table
create table if not exists public.coupon_codes (
  id bigint primary key generated always as identity,
  code text unique not null,
  is_used boolean default false,
  used_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create attendees table
create table if not exists public.attendees (
  id bigint primary key generated always as identity,
  name text not null,
  email text unique not null,
  coupon_code_id bigint references public.coupon_codes(id) on delete set null,
  registered_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create indexes for better query performance
create index if not exists idx_attendees_email on public.attendees(email);
create index if not exists idx_attendees_coupon_code_id on public.attendees(coupon_code_id);
create index if not exists idx_coupon_codes_is_used on public.coupon_codes(is_used);
create index if not exists idx_coupon_codes_used_at on public.coupon_codes(used_at);

-- Enable Row Level Security
alter table public.coupon_codes enable row level security;
alter table public.attendees enable row level security;

-- RLS Policies for coupon_codes
create policy "Allow public to read available coupons"
  on public.coupon_codes
  for select
  using (true);

create policy "Allow service role full access to coupons"
  on public.coupon_codes
  for all
  using (auth.role() = 'service_role');

create policy "Allow authenticated users to manage coupons"
  on public.coupon_codes
  for all
  using (auth.role() = 'authenticated');

-- RLS Policies for attendees
create policy "Allow public to insert attendees"
  on public.attendees
  for insert
  with check (true);

create policy "Allow public to read own attendee record"
  on public.attendees
  for select
  using (true);

create policy "Allow authenticated users to manage attendees"
  on public.attendees
  for all
  using (auth.role() = 'authenticated');

create policy "Allow service role full access to attendees"
  on public.attendees
  for all
  using (auth.role() = 'service_role');

-- Function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
create trigger set_coupon_codes_updated_at
  before update on public.coupon_codes
  for each row execute function public.handle_updated_at();

create trigger set_attendees_updated_at
  before update on public.attendees
  for each row execute function public.handle_updated_at();

