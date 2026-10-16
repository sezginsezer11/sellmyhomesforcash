-- Google Sheets source for comps reports + photo/remarks fields.
alter table public.comp_reports
  add column if not exists sheet_url text;

alter table public.comps
  add column if not exists photo_url      text,
  add column if not exists public_remarks text,
  add column if not exists current_price  text;
