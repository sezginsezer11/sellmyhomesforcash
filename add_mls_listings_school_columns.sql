-- Run this in Supabase > SQL Editor for the sellmyhomesforcash project.
-- Stores the matched school-attendance-zone name per listing, same pattern
-- as community_name — computed by matching the listing's lat/lng against
-- the polygons in school_boundaries, re-run whenever that table changes.
alter table mls_listings add column if not exists elementary_school text;
alter table mls_listings add column if not exists middle_school text;
alter table mls_listings add column if not exists high_school text;
