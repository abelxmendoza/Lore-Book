/**
 * Supabase admin client — re-exported from db adapter.
 * Test: dbAdapter exports SupabaseMock (no DB/network).
 * Non-test: real client or fallback mock when config is missing.
 */

import { config } from '../config';
import { supabaseAdmin as admin } from '../db/dbAdapter';

export const supabaseAdmin = admin;

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const missingSupabaseConfig = !config.supabaseUrl || !config.supabaseServiceRoleKey;

/** True when a real Supabase backend is configured (not test, not missing config). */
export const isSupabaseConfigured = !isTest && !missingSupabaseConfig;
