import { describe, it, expect } from 'vitest';
import {
  assertStagingIdentity,
  isStagingRuntime,
  formatSanitizedIdentityLog,
} from './stagingIdentity';

const stagingBase: NodeJS.ProcessEnv = {
  API_ENV: 'staging',
  RAILWAY_ENVIRONMENT: 'staging',
  SUPABASE_URL: 'https://madyqnyvlexmpphejqmh.supabase.co',
  DATABASE_URL: 'postgresql://postgres:x@db.madyqnyvlexmpphejqmh.supabase.co:5432/postgres',
  SUPABASE_ANON_KEY: 'anon-test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test',
  OPENAI_API_KEY: 'sk-test',
  FRONTEND_URL: 'https://lore-book-web-git-staging.vercel.app',
};

describe('stagingIdentity', () => {
  it('isStagingRuntime only when API_ENV or RAILWAY_ENVIRONMENT is staging', () => {
    expect(isStagingRuntime({ API_ENV: 'staging' })).toBe(true);
    expect(isStagingRuntime({ RAILWAY_ENVIRONMENT: 'staging' })).toBe(true);
    expect(isStagingRuntime({ API_ENV: 'production' })).toBe(false);
    expect(isStagingRuntime({ NODE_ENV: 'production' })).toBe(false);
  });

  it('passes for a clean staging identity', () => {
    const r = assertStagingIdentity(stagingBase);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sanitized.environment).toBe('staging');
      expect(r.sanitized.supabaseProject).toBe('madyqnyvlexmpphejqmh');
      expect(r.sanitized.databaseHost).toContain('madyqnyvlexmpphejqmh');
    }
  });

  it('rejects production Supabase project ref', () => {
    const r = assertStagingIdentity({
      ...stagingBase,
      SUPABASE_URL: 'https://cshtthzpgkmrbcsfghyq.supabase.co',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reasons.some((x) => /production Supabase/i.test(x))).toBe(true);
    }
  });

  it('rejects production database host', () => {
    const r = assertStagingIdentity({
      ...stagingBase,
      DATABASE_URL:
        'postgresql://postgres:x@db.cshtthzpgkmrbcsfghyq.supabase.co:5432/postgres',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reasons.some((x) => /production database/i.test(x))).toBe(true);
    }
  });

  it('rejects Railway environment=production while claiming staging API_ENV', () => {
    const r = assertStagingIdentity({
      ...stagingBase,
      RAILWAY_ENVIRONMENT: 'production',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects lorebookai.com FRONTEND_URL on staging', () => {
    const r = assertStagingIdentity({
      ...stagingBase,
      FRONTEND_URL: 'https://lorebookai.com',
    });
    expect(r.ok).toBe(false);
  });

  it('allows staging.lorebookai.com as FRONTEND_URL', () => {
    const r = assertStagingIdentity({
      ...stagingBase,
      FRONTEND_URL: 'https://staging.lorebookai.com',
    });
    expect(r.ok).toBe(true);
  });

  it('no-ops for non-staging runtimes', () => {
    const r = assertStagingIdentity({
      API_ENV: 'production',
      SUPABASE_URL: 'https://cshtthzpgkmrbcsfghyq.supabase.co',
    });
    expect(r.ok).toBe(true);
  });

  it('sanitized log never includes credentials', () => {
    const r = assertStagingIdentity(stagingBase);
    const line = formatSanitizedIdentityLog(r.sanitized);
    expect(line).toContain('environment=staging');
    expect(line).not.toMatch(/sk-|password|service-test|anon-test/i);
    expect(line).not.toContain('postgresql://');
  });
});
