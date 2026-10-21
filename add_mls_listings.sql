-- Run this in Supabase > SQL Editor for the sellmyhomesforcash project.
-- ===== MLS market database (Carmel Valley expired/canceled/withdrawn prospecting) =====
--
-- One row per MLS # (one row per distinct listing episode). The SAME physical
-- property relisted under a NEW MLS # after expiring creates a NEW row — that's
-- what lets us count "times listed" and build the prospect-exclusion logic below.
-- Re-uploading an export that includes an MLS # already in the table updates
-- that row in place (upsert by mls_number) instead of duplicating it.

create table if not exists public.mls_listings (
  id                   uuid primary key default gen_random_uuid(),

  mls_number           text not null unique,

  -- Parcel identity. apn_normalized is the primary grouping key (dashes/spaces/
  -- dots stripped). When an export has no APN, address_key is a normalized
  -- fallback and `flagged` is set so these can be spot-checked.
  apn_raw              text,
  apn_normalized        text,
  address_key          text,
  group_key            text not null,   -- coalesce(apn_normalized, 'addr:'||address_key) — what listings get grouped by
  flagged              boolean not null default false,

  address              text,
  postal_code          text,
  subdivision          text,
  neighborhood         text,
  mls_area             text,
  property_sub_type    text,

  beds_total           numeric,
  baths_total          numeric,
  living_area          numeric,
  lot_size_sqft        numeric,
  year_built           int,

  orig_list_price      numeric,
  current_price        numeric,
  close_price          numeric,

  listing_contract_date date,
  off_market_date      date,
  close_date           date,
  days_on_market       numeric,

  public_remarks       text,

  status_raw           text,
  -- One of: active, pending, sold, expired, canceled, withdrawn, unknown
  status_normalized    text not null,

  raw                  jsonb,           -- the original CSV row, keyed by its own header text
  source_filename      text,

  uploaded_at          timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists mls_listings_group_key_idx   on public.mls_listings (group_key);
create index if not exists mls_listings_apn_idx          on public.mls_listings (apn_normalized);
create index if not exists mls_listings_status_idx       on public.mls_listings (status_normalized);
create index if not exists mls_listings_subdivision_idx  on public.mls_listings (subdivision);
create index if not exists mls_listings_off_market_idx   on public.mls_listings (off_market_date);
create index if not exists mls_listings_close_date_idx   on public.mls_listings (close_date);

-- Lock the table down — same pattern as public.leads. Only the service role
-- (used server-side by /api/market-data) can read or write; no public/anon access.
alter table public.mls_listings enable row level security;
-- No policies for anon/authenticated = they get nothing. Service role bypasses RLS.


-- ===== Prospect view =====
-- A property (by group_key) is a prospect only if its single most recent
-- listing episode is expired/canceled/withdrawn. "Most recent" = greatest
-- coalesce(close_date, off_market_date, listing_contract_date). Because that
-- latest-episode's status is what we test, "no later sold/active/pending
-- record exists" falls out for free — if one did, IT would be the latest
-- episode instead, and the group would already be excluded.

create or replace view public.mls_prospects as
with scored as (
  select
    l.*,
    coalesce(l.close_date, l.off_market_date, l.listing_contract_date) as event_date
  from public.mls_listings l
),
ranked as (
  select
    s.*,
    row_number() over (
      partition by s.group_key
      order by
        s.event_date desc nulls last,
        -- tiebreak: a sold/active/pending episode on the same date outranks
        -- an expired/canceled/withdrawn one, so a same-day re-list never
        -- wrongly surfaces the expired half as the "latest" episode.
        case when s.status_normalized in ('sold','active','pending') then 0 else 1 end,
        s.id desc
    ) as rn_latest,
    row_number() over (
      partition by s.group_key
      order by s.event_date asc nulls last, s.id asc
    ) as rn_first
  from scored s
),
latest as (select * from ranked where rn_latest = 1),
first_ev as (
  select group_key, orig_list_price as original_list_price
  from ranked where rn_first = 1
),
counts as (
  select
    group_key,
    count(*) as total_listings,
    count(*) filter (where status_normalized <> 'sold') as times_listed_without_selling
  from public.mls_listings
  group by group_key
)
select
  latest.group_key,
  latest.apn_normalized,
  latest.flagged,
  latest.mls_number          as last_mls_number,
  latest.address,
  latest.subdivision,
  latest.neighborhood,
  latest.mls_area,
  latest.property_sub_type,
  latest.beds_total,
  latest.baths_total,
  latest.living_area,
  latest.lot_size_sqft,
  latest.year_built,
  latest.status_normalized   as last_status,
  latest.orig_list_price     as last_list_price,
  latest.current_price       as last_current_price,
  first_ev.original_list_price,
  latest.off_market_date     as last_off_market_date,
  (current_date - latest.off_market_date) as days_since_off_market,
  counts.total_listings,
  counts.times_listed_without_selling
from latest
join first_ev using (group_key)
join counts   using (group_key)
where latest.status_normalized in ('expired','canceled','withdrawn');
