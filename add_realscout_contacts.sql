-- Run this in Supabase > SQL Editor for the sellmyhomesforcash project.
-- A local copy of the RealScout contacts, so they can be searched by address,
-- city or ZIP — RealScout's own API only filters by name, email, tag and
-- status, so address search has to happen on our side.
--
-- Keyed on RealScout's own contact id, so a re-sync updates in place rather
-- than duplicating. Only the fields the admin list actually shows are kept;
-- activity/alert counts are deliberately left out since they're relative to
-- a look-back window and would be stale the moment they're written.

create table if not exists public.realscout_contacts (
  id                   text primary key,   -- RealScout's contact id
  first_name           text,
  last_name            text,
  email                text,
  primary_mobile_phone text,
  street               text,
  city                 text,
  state                text,
  zipcode              text,
  contact_type         text,               -- BUYER | BUYER_SELLER | SELLER | OTHER
  status               text,               -- UNDESIGNATED | NURTURED | OVERAGE | ARCHIVED
  lead_source          text,
  tags                 jsonb,
  scout_score          integer,
  last_active_at       timestamptz,
  rs_created_at        timestamptz,        -- when RealScout created the contact
  rs_updated_at        timestamptz,
  archived_at          timestamptz,
  realscout_url        text,
  -- Geocoded from street/city/zipcode for the map view. RealScout doesn't
  -- return coordinates, so these are filled in by a backfill pass after a
  -- sync. 0,0 marks "tried and failed" so it isn't retried every run.
  lat                  double precision,
  lng                  double precision,
  synced_at            timestamptz not null default now()
);

create index if not exists realscout_contacts_zipcode_idx on public.realscout_contacts (zipcode);
create index if not exists realscout_contacts_city_idx on public.realscout_contacts (city);
create index if not exists realscout_contacts_scout_score_idx on public.realscout_contacts (scout_score desc);

alter table public.realscout_contacts enable row level security;
