-- Run this in Supabase > SQL Editor for the sellmyhomesforcash project.
-- Adds a public share slug to mls_lists. A list with a slug set is viewable,
-- read-only, at /market-data/share/[slug] with NO admin auth required — the
-- API only ever returns a stripped-down, non-MLS-sensitive field set for that
-- route (no status, price, DOM, MLS#, or APN), so this does not reopen the
-- "no public routes" rule for the rest of Market Data.

alter table public.mls_lists add column if not exists slug text unique;
