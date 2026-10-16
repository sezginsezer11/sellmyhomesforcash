-- Comps v2: starred + admin photo override.
alter table public.comps
  add column if not exists starred        boolean default false,
  add column if not exists photo_override text;

-- Supabase Storage bucket "comp-photos" (public read) is created in the
-- dashboard: Storage → New bucket → name: comp-photos → Public bucket ON.
