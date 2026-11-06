-- Run this in Supabase > SQL Editor for the sellmyhomesforcash project.
-- community_name is set by matching each listing's lat/lng against the
-- imported community_boundaries polygons ("Match communities" in the admin
-- Upload tab). NULL means "not checked yet"; '' (empty string) means
-- "checked, no polygon contains this point" — same not-null-but-unmatched
-- convention already used for the geocode 0,0 sentinel.

alter table public.mls_listings add column if not exists community_name text;
