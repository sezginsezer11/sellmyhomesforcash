-- Seller accounts + early-capture funnel columns.
alter table public.leads
  add column if not exists user_id uuid,
  add column if not exists lead_type text default 'potential seller',
  add column if not exists submitted boolean default false;

create index if not exists leads_user_id_idx on public.leads (user_id);
create index if not exists leads_email_lower_idx on public.leads (lower(email));
create index if not exists leads_submitted_idx on public.leads (submitted);
