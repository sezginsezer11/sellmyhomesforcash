-- Soft-delete support for leads (admin can delete/restore).
alter table public.leads
  add column if not exists deleted boolean default false;

create index if not exists leads_deleted_idx on public.leads (deleted);
