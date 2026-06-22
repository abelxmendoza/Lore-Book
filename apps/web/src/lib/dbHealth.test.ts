import { describe, it, expect } from 'vitest';

import {
  buildOpsBannerContent,
  buildStorageBannerMessage,
  formatBytes,
  formatUtilizationPercent,
  shouldShowOpsBanner,
  opsSeverity,
  EMPTY_CONNECTION_HINTS,
  EMPTY_UPGRADE_SNAPSHOT,
} from './dbHealth';

describe('dbHealth', () => {
  it('shows banner for storage or upgrade warn/critical', () => {
    expect(
      shouldShowOpsBanner({
        status: 'warn',
        missingTables: [],
        lastSchemaSync: null,
        storage: { status: 'ok' } as never,
        upgrade: { status: 'warn' } as never,
        connection: EMPTY_CONNECTION_HINTS,
      })
    ).toBe(true);
    expect(shouldShowOpsBanner(null)).toBe(false);
  });

  it('formats bytes and utilization', () => {
    expect(formatBytes(420_000_000)).toBe('400.5 MB');
    expect(formatUtilizationPercent(0.823)).toBe('82%');
  });

  it('ranks severity for dismiss escalation', () => {
    expect(opsSeverity('warn')).toBeLessThan(opsSeverity('critical'));
  });

  it('builds combined ops banner content', () => {
    const content = buildOpsBannerContent({
      status: 'warn',
      missingTables: [],
      lastSchemaSync: null,
      storage: {
        status: 'warn',
        databaseBytes: 420_000_000,
        walBytes: 0,
        quotaBytes: 524_288_000,
        utilizationRatio: 0.8,
        checkedAt: new Date().toISOString(),
      },
      upgrade: {
        ...EMPTY_UPGRADE_SNAPSHOT,
        status: 'warn',
        warnings: ['pg_cron bloat detected'],
      },
      connection: EMPTY_CONNECTION_HINTS,
    });
    expect(content.headline).toMatch(/80%/);
    expect(content.details).toContain('pg_cron bloat detected');
  });

  it('builds actionable storage copy', () => {
    const msg = buildStorageBannerMessage({
      status: 'critical',
      databaseBytes: 480_000_000,
      walBytes: 10_000_000,
      quotaBytes: 524_288_000,
      utilizationRatio: 0.92,
      checkedAt: new Date().toISOString(),
    });
    expect(msg).toMatch(/critical/i);
    expect(msg).toMatch(/92%/);
  });
});
