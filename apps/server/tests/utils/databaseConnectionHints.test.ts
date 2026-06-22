import { describe, it, expect } from 'vitest';

import { resolveDatabaseConnectionHints } from '../../src/utils/databaseConnectionHints';

describe('resolveDatabaseConnectionHints', () => {
  it('detects ssl-enforcement-ready modes', () => {
    expect(
      resolveDatabaseConnectionHints({
        DATABASE_URL: 'postgresql://u:p@host:5432/postgres?sslmode=verify-full',
      }).sslEnforcementReady
    ).toBe(true);
  });

  it('flags missing sslmode', () => {
    const hints = resolveDatabaseConnectionHints({
      DATABASE_URL: 'postgresql://u:p@host:5432/postgres',
    });
    expect(hints.databaseUrlConfigured).toBe(true);
    expect(hints.sslEnforcementReady).toBe(false);
  });
});
