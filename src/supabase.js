import { createClient } from '@supabase/supabase-js';

let cached;

export function getSupabaseAdmin() {
  if (cached) return cached;

  let url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }

  // Normalize URL: the client adds /rest/v1 automatically.
  url = url.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
