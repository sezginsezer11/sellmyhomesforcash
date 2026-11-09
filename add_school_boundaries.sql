-- Run this in Supabase > SQL Editor for the sellmyhomesforcash project.
-- Mirrors community_boundaries, but for school attendance-zone polygons
-- (elementary/middle/high), each tagged with the school district they came
-- from so a re-import of one district/level never touches another's shapes.

create table if not exists public.school_boundaries (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,              -- school name, e.g. "Torrey Pines High"
  level         text not null,              -- 'elementary' | 'middle' | 'high'
  district      text not null,              -- e.g. "San Dieguito Union High School District"
  geometry_type text not null,              -- 'polygon' | 'point'
  ring          jsonb not null,             -- array of [lng, lat] pairs
  created_at    timestamptz not null default now()
);

create index if not exists school_boundaries_level_idx on public.school_boundaries (level);
create index if not exists school_boundaries_district_idx on public.school_boundaries (district);

alter table public.school_boundaries enable row level security;
