-- Comps v3: map coords + report display toggles.
alter table public.comps
  add column if not exists lat numeric,
  add column if not exists lng numeric;

alter table public.comp_reports
  add column if not exists show_stats boolean default true,
  add column if not exists show_map   boolean default true;
