import { createClient } from '@supabase/supabase-js';

// Server-side client using the service role key.
// NEVER expose the service role key to the browser — this file is only
// imported by server code (the /api/lead route).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);
