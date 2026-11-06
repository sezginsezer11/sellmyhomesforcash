-- Run this in Supabase > SQL Editor for the sellmyhomesforcash project.
-- Tracks every CSV upload (client/batch name + per-file summary counts) so the
-- admin Upload tab can show history ("which client did I upload this for?").

create table if not exists public.mls_uploads (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  filename        text not null,
  uploaded_at     timestamptz not null default now(),
  read_count      int not null default 0,
  inserted_count  int not null default 0,
  updated_count   int not null default 0,
  skipped_count   int not null default 0,
  flagged_count   int not null default 0
);

create index if not exists mls_uploads_uploaded_at_idx on public.mls_uploads (uploaded_at desc);

-- Same lockdown as the other mls_ tables — service role only, no public/anon access.
alter table public.mls_uploads enable row level security;
