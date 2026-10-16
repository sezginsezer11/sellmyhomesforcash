-- Client dashboard columns for sellmyhomesforcash leads
alter table public.leads
  add column if not exists access_token      text,
  add column if not exists offer_amount       numeric,
  add column if not exists offer_details       text,
  add column if not exists client_status       text default 'Reviewing',
  add column if not exists est_closing_costs    numeric,
  add column if not exists estimated_net        numeric;

-- Fast lookup of a seller's private dashboard by their secret link
create unique index if not exists leads_access_token_idx
  on public.leads (access_token)
  where access_token is not null;

-- Backfill tokens for any existing leads that don't have one yet
update public.leads
  set access_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  where access_token is null;
