'use client';

import { createClient } from '@supabase/supabase-js';

// Browser-side client using the PUBLISHABLE (anon) key — safe to expose.
// Used only for the admin login flow. All privileged data access still
// happens server-side with the secret key.
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
