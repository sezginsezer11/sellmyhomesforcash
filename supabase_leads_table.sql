-- Run this in Supabase > SQL Editor for the sellmyhomesforcash project.

create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  name         text not null,
  phone        text,
  email        text,
  address      text not null,
  timeline     text,
  condition    text,
  source       text default 'landing',
  user_agent   text
);

-- Lock the table down. Only the service role (used server-side by the
-- /api/lead route) can write. No public/anon access at all.
alter table public.leads enable row level security;

-- No policies for anon/authenticated = they get nothing.
-- The service role bypasses RLS, so server inserts still work.
