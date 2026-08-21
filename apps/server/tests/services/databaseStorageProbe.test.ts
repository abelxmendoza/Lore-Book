import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  probeDatabaseStorage,
  resetDatabaseStorageProbeCache,
  noteDatabaseWriteBlocked,
} from '../../src/services/databaseStorageProbe';

describe('probeDatabaseStorage', () => {
  beforeEach(() => {
    resetDatabaseStorageProbeCache();
    vi.unstubAllEnvs();
  });

  it('returns unknown when Supabase is not configured (tests)', async () => {
    const snapshot = await probeDatabaseStorage(true);
    expect(snapshot.status).toBe('unknown');
    expect(snapshot.databaseBytes).toBeNull();
    expect(snapshot.quotaBytes).toBe(500 * 1024 * 1024);
    expect(snapshot.writeBlocked).toBe(false);
  });

  it('stamps write-blocked onto the probe after a save failure', async () => {
    noteDatabaseWriteBlocked('read_only');
    const snapshot = await probeDatabaseStorage(true);
    expect(snapshot.writeBlocked).toBe(true);
    expect(snapshot.writeBlockedReason).toBe('read_only');
    expect(snapshot.status).toBe('critical');
  });

  it('caches results within TTL (O(1) hot path)', async () => {
    const first = await probeDatabaseStorage(true);
    const second = await probeDatabaseStorage(false);
    expect(second.checkedAt).toBe(first.checkedAt);
  });
});

describe('statusFromUtilization (via probe)', () => {
  it('respects DB_DATABASE_QUOTA_BYTES override', async () => {
    vi.stubEnv('DB_DATABASE_QUOTA_BYTES', String(1000));
    resetDatabaseStorageProbeCache();
    const snapshot = await probeDatabaseStorage(true);
    expect(snapshot.quotaBytes).toBe(1000);
  });
});
