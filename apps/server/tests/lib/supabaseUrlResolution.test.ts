import { describe, expect, it, afterEach } from 'vitest';

import {
  deriveSupabaseFallbackUrl,
  getActiveSupabaseUrl,
  projectRefFromSupabaseJwt,
  setActiveSupabaseUrl,
} from '../../src/lib/supabaseUrlResolution';

const SAMPLE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzaHR0aHpwZ2ttcmJjc2ZnaHlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjE0NjgsImV4cCI6MjA5NTIzNzQ2OH0.sig';

describe('supabaseUrlResolution', () => {
  it('extracts project ref from anon JWT', () => {
    expect(projectRefFromSupabaseJwt(SAMPLE_ANON)).toBe('cshtthzpgkmrbcsfghyq');
  });

  it('derives *.supabase.co fallback from JWT when primary is custom domain', () => {
    expect(
      deriveSupabaseFallbackUrl({
        primary: 'https://supabase.lorebookai.com',
        anonKey: SAMPLE_ANON,
      })
    ).toBe('https://cshtthzpgkmrbcsfghyq.supabase.co');
  });

  it('prefers explicit fallback env over JWT derivation', () => {
    expect(
      deriveSupabaseFallbackUrl({
        primary: 'https://supabase.lorebookai.com',
        fallback: 'https://custom-fallback.example.com',
        anonKey: SAMPLE_ANON,
      })
    ).toBe('https://custom-fallback.example.com');
  });

  it('returns null when primary is already the default project URL', () => {
    expect(
      deriveSupabaseFallbackUrl({
        primary: 'https://cshtthzpgkmrbcsfghyq.supabase.co',
        anonKey: SAMPLE_ANON,
      })
    ).toBeNull();
  });

  it('falls back to SUPABASE_URL env when boot has not set active URL yet', () => {
    const previous = process.env.SUPABASE_URL;
    setActiveSupabaseUrl('');
    process.env.SUPABASE_URL = 'https://supabase.lorebookai.com';
    expect(getActiveSupabaseUrl()).toBe('https://supabase.lorebookai.com');
    process.env.SUPABASE_URL = previous;
  });

  afterEach(() => {
    setActiveSupabaseUrl(process.env.SUPABASE_URL ?? '');
  });
});
