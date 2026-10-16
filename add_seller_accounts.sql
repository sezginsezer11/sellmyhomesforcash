-- Seller accounts: link a lead to its Supabase Auth user.
alter table public.leads
  add column if not exists user_id uuid;

create index if not exists leads_user_id_idx on public.leads (user_id);

-- Helps the email-match claim run fast and case-insensitively.
create index if not exists leads_email_lower_idx on public.leads (lower(email));
