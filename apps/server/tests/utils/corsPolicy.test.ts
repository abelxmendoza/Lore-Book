import { describe, it, expect } from 'vitest';

import {
  normalizeOrigin,
  getAllowedCorsOrigins,
  evaluateOrigin,
  isOriginAllowed,
  STATIC_ALLOWED_ORIGINS,
} from '../../src/utils/corsPolicy';

describe('normalizeOrigin', () => {
  it('returns null for empty input', () => {
    expect(normalizeOrigin(undefined)).toBeNull();
    expect(normalizeOrigin(null)).toBeNull();
    expect(normalizeOrigin('')).toBeNull();
  });

  it('canonicalizes a URL to its origin', () => {
    expect(normalizeOrigin('https://lorebookai.com/login')).toBe('https://lorebookai.com');
    expect(normalizeOrigin('https://lorebookai.com')).toBe('https://lorebookai.com');
  });

  it('strips trailing slashes from non-URL fallbacks', () => {
    expect(normalizeOrigin('lorebookai.com/')).toBe('lorebookai.com');
  });
});

describe('getAllowedCorsOrigins', () => {
  it('always includes the static first-party origins', () => {
    const origins = getAllowedCorsOrigins({});
    for (const o of STATIC_ALLOWED_ORIGINS) {
      expect(origins).toContain(o);
    }
  });

  it('includes FRONTEND_URL when set', () => {
    const origins = getAllowedCorsOrigins({ FRONTEND_URL: 'https://staging.lorebookai.com' });
    expect(origins).toContain('https://staging.lorebookai.com');
  });

  it('derives the API origin from VITE_API_URL (strips /api suffix)', () => {
    const origins = getAllowedCorsOrigins({
      VITE_API_URL: 'https://api.lorebookai.com/api',
    });
    expect(origins).toContain('https://api.lorebookai.com');
  });

  it('de-duplicates origins', () => {
    const origins = getAllowedCorsOrigins({ FRONTEND_URL: 'https://lorebookai.com' });
    const count = origins.filter((o) => o === 'https://lorebookai.com').length;
    expect(count).toBe(1);
  });
});

describe('evaluateOrigin', () => {
  it('allows requests with no Origin header (curl, mobile, server-to-server)', () => {
    expect(evaluateOrigin(undefined, {})).toEqual({ allowed: true, reason: 'no-origin' });
  });

  // The production site origin that hit the CORS error during the outage.
  it('allows the production site origin', () => {
    expect(isOriginAllowed('https://lorebookai.com', {})).toBe(true);
    expect(evaluateOrigin('https://lorebookai.com', {}).reason).toBe('allow-list');
  });

  it('allows www and apex variants', () => {
    expect(isOriginAllowed('https://www.lorebookai.com', {})).toBe(true);
    expect(isOriginAllowed('https://lorebook.app', {})).toBe(true);
  });

  it('allows localhost on any port by default', () => {
    expect(evaluateOrigin('http://localhost:5173', {}).reason).toBe('localhost');
    expect(isOriginAllowed('http://127.0.0.1:4000', {})).toBe(true);
    expect(isOriginAllowed('https://localhost', {})).toBe(true);
  });

  it('can disable localhost allowance', () => {
    expect(isOriginAllowed('http://localhost:5173', {}, { allowLocalhost: false })).toBe(false);
  });

  it('allows Vercel preview deployments by default', () => {
    expect(evaluateOrigin('https://lore-keeper-web-git-feat.vercel.app', {}).reason).toBe(
      'vercel-preview'
    );
  });

  it('can disable Vercel preview allowance', () => {
    expect(
      isOriginAllowed('https://random-preview.vercel.app', {}, { allowVercelPreview: false })
    ).toBe(false);
  });

  it('blocks unknown third-party origins', () => {
    const decision = evaluateOrigin('https://evil.example.com', {});
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('not-allowed');
  });

  it('blocks look-alike domains that are not exact matches', () => {
    expect(isOriginAllowed('https://lorebookai.com.evil.com', {})).toBe(false);
    expect(isOriginAllowed('https://notlorebookai.com', {})).toBe(false);
  });

  it('respects env-configured origins', () => {
    const env = { FRONTEND_URL: 'https://custom.example.com' };
    expect(isOriginAllowed('https://custom.example.com', env)).toBe(true);
    expect(isOriginAllowed('https://custom.example.com', {})).toBe(false);
  });
});
