-- Tracks whether community_name was set by hand (admin override) rather than
-- by KML polygon matching. A re-import of the community map / a re-match run
-- must never overwrite a manually-assigned community.
alter table mls_listings add column if not exists community_manual boolean not null default false;
