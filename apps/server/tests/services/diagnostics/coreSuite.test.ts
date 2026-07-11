import { describe, expect, it, beforeEach } from 'vitest';
import { runCoreSuite } from '../../../src/services/diagnostics/coreSuite';
import {
  getCoreSuiteSnapshot,
  setCoreSuiteSnapshot,
} from '../../../src/services/diagnostics/coreSuiteSnapshot';
import { resolveMetaProductContext } from '../../../src/services/chat/lorebookSelfModelService';

describe('coreSuite', () => {
  beforeEach(() => {
    setCoreSuiteSnapshot(null);
  });

  it('runs must-pass checks and stores a snapshot', async () => {
    const result = await runCoreSuite({ includeChatLive: false });
    expect(result.suites.map((s) => s.id)).toEqual([
      'boot',
      'durability',
      'recall',
      'self_model',
    ]);
    expect(result.checks.length).toBeGreaterThan(5);
    expect(result.checks.some((c) => c.id === 'self-creator')).toBe(true);
    expect(result.checks.find((c) => c.id === 'self-creator')?.status).toBe('PASS');
    expect(result.checks.find((c) => c.id === 'self-focus-user-first')?.status).toBe('PASS');
    expect(getCoreSuiteSnapshot()?.runId).toBe(result.runId);
  });

  it('lets status questions cite the last snapshot', async () => {
    setCoreSuiteSnapshot({
      runId: 'snap-1',
      status: 'PASS',
      completedAt: '2026-07-11T12:00:00.000Z',
      durationMs: 100,
      summary: { PASS: 10, WARN: 0, FAIL: 0, SKIPPED: 0 },
      suites: [{ id: 'boot', name: 'Boot & config', status: 'PASS' }],
    });
    const resolved = await resolveMetaProductContext('Are you working?');
    expect(resolved.shortCircuit?.content).toMatch(/Core health checks last passed|online|status|ready|LoreBook/i);
  });
});
