import { createClient } from '@supabase/supabase-js';

import { config } from '../config';

const missingSupabaseConfig = !config.supabaseUrl || !config.supabaseServiceRoleKey;
const missingConfigError = new Error(
  'Supabase client not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable database access.'
);

const createMockQueryBuilder = () => {
  const errorResult = { data: null, error: missingConfigError };
  const builder: any = {
    data: null,
    error: missingConfigError,
    insert: () => builder,
    update: () => builder,
    upsert: () => builder,
    select: () => builder,
    eq: () => builder,
    ilike: () => builder,
    contains: () => builder,
    gte: () => builder,
    lte: () => builder,
    order: () => builder,
    limit: async () => errorResult,
    single: async () => errorResult
  };
  return builder;
};

const createMockSupabaseClient = () => {
  console.warn('⚠️  Using mock Supabase client because environment variables are missing.');
  return {
    from: () => createMockQueryBuilder(),
    rpc: async () => ({ data: null, error: missingConfigError })
  } as any;
};

export const supabaseAdmin = missingSupabaseConfig
  ? createMockSupabaseClient()
  : createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false }
    });
