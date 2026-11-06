-- Run this in Supabase > SQL Editor for the sellmyhomesforcash project.
-- Stores the named community/complex boundaries imported from the Carmel
-- Valley Google My Maps map (polygons, plus the occasional bare point).
-- Each import fully replaces the table's contents (the admin re-uploads the
-- whole KML whenever the map has been updated), so there's no reason to key
-- rows across imports — just whatever's currently in the file.

create table if not exists public.community_boundaries (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  layer         text,
  geometry_type text not null,  -- 'polygon' | 'point'
  ring          jsonb not null, -- array of [lng, lat] pairs
  created_at    timestamptz not null default now()
);

alter table public.community_boundaries enable row level security;
