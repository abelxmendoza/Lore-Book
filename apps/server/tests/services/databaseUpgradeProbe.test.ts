import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  evaluateUpgradeReadiness,
  mergeOpsStatus,
  parseOpsRpcPayload,
} from '../../src/services/databaseUpgradeProbe';

describe('parseOpsRpcPayload', () => {
  it('parses extended ops fields from RPC json', () => {
    const parsed = parseOpsRpcPayload({
      database_bytes: 100,
      wal_bytes: 10,
      postgres_version: '15.8',
      postgres_major: 15,
      cron_job_run_details_rows: 150_000,
      deprecated_extensions: ['pgjwt'],
    });
    expect(parsed.postgresMajor).toBe(15);
    expect(parsed.cronJobRunDetailsRows).toBe(150_000);
    expect(parsed.deprecatedExtensions).toEqual(['pgjwt']);
  });
});

describe('evaluateUpgradeReadiness', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('warns on large pg_cron history', () => {
    const result = evaluateUpgradeReadiness(
      parseOpsRpcPayload({ cron_job_run_details_rows: 120_000, postgres_major: 15 })
    );
    expect(result.status).toBe('warn');
    expect(result.warnings.some((w) => w.includes('pg_cron'))).toBe(true);
  });

  it('critical when cron history exceeds critical threshold', () => {
    vi.stubEnv('DB_CRON_CRITICAL_ROWS', '1000');
    const result = evaluateUpgradeReadiness(
      parseOpsRpcPayload({ cron_job_run_details_rows: 2000, postgres_major: 15 })
    );
    expect(result.status).toBe('critical');
  });

  it('warns when PG17-deprecated extensions are installed on PG15', () => {
    const result = evaluateUpgradeReadiness(
      parseOpsRpcPayload({
        postgres_major: 15,
        deprecated_extensions: ['pgjwt'],
      })
    );
    expect(result.status).toBe('warn');
    expect(result.warnings.some((w) => w.includes('pgjwt'))).toBe(true);
  });
});

describe('mergeOpsStatus', () => {
  it('returns the higher severity', () => {
    expect(mergeOpsStatus('ok', 'warn')).toBe('warn');
    expect(mergeOpsStatus('warn', 'critical')).toBe('critical');
  });
});
