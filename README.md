# sellmyhomesforcash.com — Phase 1 landing page

Next.js 15 + Tailwind + Supabase. Lead form posts to /api/lead which
inserts into the Supabase `leads` table using the service-role key
(server-only). Built to grow into a multi-page platform later.

## Local setup
1. npm install
2. Copy .env.local.example to .env.local and fill in Supabase keys
3. npm run dev  ->  http://localhost:3000

## Supabase
Run supabase_leads_table.sql in the SQL editor once.

## Deploy
Push to GitHub, import into Vercel, add the two env vars in Vercel
project settings. Point the domain at Vercel.
