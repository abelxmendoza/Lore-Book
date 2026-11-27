import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: {} }));

import { sanitizeSearchTerm, slugify } from '../../src/services/hivemind/hivemindService';

describe('hivemindService helpers', () => {
  it('slugify is stable so the same title updates the same memory', () => {
    expect(slugify('Web install needs --legacy-peer-deps!')).toBe('web-install-needs-legacy-peer-deps');
    expect(slugify('!!!')).toBe('memory');
  });

  it('sanitizeSearchTerm escapes LIKE wildcards and strips or() separators', () => {
    expect(sanitizeSearchTerm('100%_done')).toBe('100\\%\\_done');
    expect(sanitizeSearchTerm('a,b),title.eq.x')).toBe('a b  title.eq.x');
  });
});
