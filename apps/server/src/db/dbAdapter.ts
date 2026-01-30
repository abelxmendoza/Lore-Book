/**
 * Layer 1 — Database Adapter
 * In test: export SupabaseMock (no DB/network).
 * Else: export real Supabase client or fallback mock when config is missing.
 */

import { createClient } from '@supabase/supabase-js';

import { config } from '../config';
import { createSupabaseMock } from './supabaseMock';

const isTest =
  process.env.NODE_ENV === 'test' ||
  process.env.VITEST === 'true';

const missingSupabaseConfig = !config.supabaseUrl || !config.supabaseServiceRoleKey;

function createRealOrFallback() {
  if (missingSupabaseConfig) {
    return createSupabaseMock();
  }
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });
}

/** Single source of truth: test → mock, else → real client or fallback mock. */
export const supabaseAdmin = isTest ? createSupabaseMock() : createRealOrFallback();
