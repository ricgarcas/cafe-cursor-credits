-- Cafe Cursor Toronto - Supabase Database Schema
-- Run this in your Supabase SQL Editor

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
-- Allow public to read available coupon codes (for registration)
create policy "Allow public to read available coupons"
  on public.coupon_codes
  for select
  using (true);

-- Allow service role (admin) to do everything
create policy "Allow service role full access to coupons"
  on public.coupon_codes
  for all
  using (auth.role() = 'service_role');

-- Allow authenticated users (admins) to manage coupons
create policy "Allow authenticated users to manage coupons"
  on public.coupon_codes
  for all
  using (auth.role() = 'authenticated');

-- RLS Policies for attendees
-- Allow public to insert new attendees (registration)
create policy "Allow public to insert attendees"
  on public.attendees
  for insert
  with check (true);

-- Allow public to read their own record by email
create policy "Allow public to read own attendee record"
  on public.attendees
  for select
  using (true);

-- Allow authenticated users (admins) to manage attendees
create policy "Allow authenticated users to manage attendees"
  on public.attendees
  for all
  using (auth.role() = 'authenticated');

-- Allow service role full access
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

-- Sample coupon codes (optional - remove in production)
-- insert into public.coupon_codes (code) values
--   ('CURSOR-ABC123'),
--   ('CURSOR-DEF456'),
--   ('CURSOR-GHI789');

