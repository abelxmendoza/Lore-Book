import { describe, expect, it } from 'vitest';

import { deriveSupabaseFallbackUrl } from './supabaseUrlResolution';

const SAMPLE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzaHR0aHpwZ2ttcmJjc2ZnaHlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjE0NjgsImV4cCI6MjA5NTIzNzQ2OH0.sig';

describe('supabaseUrlResolution (web)', () => {
  it('derives fallback from anon key when using custom domain', () => {
    expect(
      deriveSupabaseFallbackUrl({
        primary: 'https://supabase.lorebookai.com',
        anonKey: SAMPLE_ANON,
      })
    ).toBe('https://cshtthzpgkmrbcsfghyq.supabase.co');
  });
});
