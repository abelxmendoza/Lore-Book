import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client. Node.js < 22 needs `ws` for Realtime transport.
 * @see https://supabase.com/docs/guides/realtime/postgres-changes
 */
export function createServerSupabaseClient(
  supabaseUrl: string,
  supabaseKey: string,
): SupabaseClient {
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
}
