-- ===== Comps hub =====

-- Redfin property profile cache (30-day) — used so repeat lookups don't burn API credits.
create table if not exists public.redfin_cache (
  address_key text primary key,
  facts       jsonb,
  fetched_at  timestamptz default now()
);

-- A comps report, built for one subject property. Public URL = slug of its address.
create table if not exists public.comp_reports (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,          -- e.g. 3650-fifth-ave-san-diego-a1b2
  subject_address text not null,
  subject_zip     text,
  client_name     text,
  title           text,
  intro           text,                          -- optional note shown to the client
  deleted         boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- One comparable property row within a report. All fields editable by admin.
create table if not exists public.comps (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid references public.comp_reports(id) on delete cascade,
  sort_order     int default 0,
  mls_number     text,
  status         text,
  sub_type       text,
  my_notes       text,
  address        text,
  postal_code    text,
  year_built     text,
  beds           text,
  baths          text,
  living_area    text,
  lot_size_sqft  text,
  sold_ppsf      text,   -- Sold Price Per SQFT (computed, editable)
  close_price    text,
  close_date     text,
  orig_list_price text,
  price_ppsf     text,   -- Price Per SQFT
  days_on_market text,
  redfin_url     text,   -- the Redfin property URL (for refresh)
  created_at     timestamptz default now()
);

create index if not exists comps_report_idx on public.comps (report_id);
create index if not exists comp_reports_slug_idx on public.comp_reports (slug);
