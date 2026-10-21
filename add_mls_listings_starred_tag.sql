-- Run this in Supabase > SQL Editor for the sellmyhomesforcash project.
-- Adds manual starring and a free-text tag to mls_listings, and exposes both
-- (plus the underlying row id) on the mls_prospects view.

alter table public.mls_listings add column if not exists starred boolean not null default false;
alter table public.mls_listings add column if not exists tag text;

create index if not exists mls_listings_starred_idx on public.mls_listings (starred);
create index if not exists mls_listings_tag_idx      on public.mls_listings (tag);

-- Same view as add_mls_listings.sql, just with latest.id/starred/tag added to the select
-- list. Dropped and recreated rather than CREATE OR REPLACE, because Postgres only lets
-- REPLACE append new columns at the end — it can't insert one in the middle of the list,
-- which is what adding last_id before the existing last_mls_number would do. A view holds
-- no data, so dropping and recreating it is safe.
drop view if exists public.mls_prospects;
create view public.mls_prospects as
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
  latest.id                  as last_id,
  latest.mls_number          as last_mls_number,
  latest.starred,
  latest.tag,
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
