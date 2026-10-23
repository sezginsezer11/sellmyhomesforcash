-- Run this in Supabase > SQL Editor for the sellmyhomesforcash project.
-- Lists: named collections of properties built by selecting rows in Search
-- (table or map view). Items reference group_key (the same property-identity
-- key mls_prospects/mls_listings already use), not a specific MLS # episode,
-- so a property stays on a list across relistings.

create table if not exists public.mls_lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mls_list_items (
  id        uuid primary key default gen_random_uuid(),
  list_id   uuid not null references public.mls_lists(id) on delete cascade,
  group_key text not null,
  added_at  timestamptz not null default now(),
  unique (list_id, group_key)
);

create index if not exists mls_list_items_list_idx  on public.mls_list_items (list_id);
create index if not exists mls_list_items_group_idx on public.mls_list_items (group_key);

-- Same lockdown as the other mls_ tables — service role only, no public/anon access.
alter table public.mls_lists enable row level security;
alter table public.mls_list_items enable row level security;
