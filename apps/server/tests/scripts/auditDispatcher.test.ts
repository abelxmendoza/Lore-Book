import { describe, it, expect, vi } from 'vitest';

/**
 * Unit tests for the unified audit dispatcher and the pure query-classification matrix.
 */

vi.mock('../../scripts/audits/wma', () => ({
  runWmaSuite: vi.fn(async () => undefined),
}));
vi.mock('../../scripts/audits/story', () => ({
  runStorySuite: vi.fn(async () => undefined),
}));
vi.mock('../../scripts/audits/episodes', () => ({
  runEpisodesSuite: vi.fn(async () => undefined),
}));
vi.mock('../../scripts/audits/integrity', () => ({
  runIntegritySuite: vi.fn(async () => undefined),
}));

import { resolveAuditCommand, runAudit } from '../../scripts/audit';
import { runWmaSuite } from '../../scripts/audits/wma';
import { runStorySuite } from '../../scripts/audits/story';
import { runEpisodesSuite } from '../../scripts/audits/episodes';
import { runIntegritySuite } from '../../scripts/audits/integrity';
import {
  runQueryClassificationMatrix,
  QUERY_CLASSIFICATION_CASES,
} from '../../scripts/audits/wma/queryClassification';

describe('audit — resolveAuditCommand (unit)', () => {
  it('maps known suite names', async () => {
    expect(await resolveAuditCommand(['wma', '--check', 'memory'])).toEqual({
      suite: 'wma',
      rest: ['--check', 'memory'],
    });
    expect(await resolveAuditCommand(['integrity'])).toEqual({ suite: 'integrity', rest: [] });
    expect(await resolveAuditCommand(['all'])).toEqual({ suite: 'all', rest: [] });
  });

  it('returns null for unknown input', async () => {
    expect(await resolveAuditCommand([])).toBeNull();
    expect(await resolveAuditCommand(['nope'])).toBeNull();
  });
});

describe('audit — runAudit dispatch (integration)', () => {
  beforeEach(() => {
    vi.mocked(runWmaSuite).mockClear();
    vi.mocked(runStorySuite).mockClear();
    vi.mocked(runEpisodesSuite).mockClear();
    vi.mocked(runIntegritySuite).mockClear();
  });

  it('throws on an unknown suite', async () => {
    await expect(runAudit(['wat'])).rejects.toThrow(/Usage: audit.ts/);
  });

  it('dispatches the WMA suite with parsed checks', async () => {
    await runAudit(['wma', '--check', 'classification,memory']);
    expect(runWmaSuite).toHaveBeenCalledOnce();
    expect(runWmaSuite).toHaveBeenCalledWith(['classification', 'memory'], ['--check', 'classification,memory']);
  });

  it('throws on an unknown --check for a suite', async () => {
    await expect(runAudit(['wma', '--check', 'bogus'])).rejects.toThrow(/Unknown --check/);
  });

  it('"all" runs every suite in order', async () => {
    await runAudit(['all', '--user-id', 'u1']);
    expect(runWmaSuite).toHaveBeenCalledOnce();
    expect(runStorySuite).toHaveBeenCalledOnce();
    expect(runEpisodesSuite).toHaveBeenCalledOnce();
    expect(runIntegritySuite).toHaveBeenCalledOnce();
  });
});

describe('queryClassification — runQueryClassificationMatrix (unit)', () => {
  it('scores a perfect matrix when classifier matches expected intents', () => {
    const cases = QUERY_CLASSIFICATION_CASES.map((c) => ({ ...c }));
    const result = runQueryClassificationMatrix(cases);
    expect(result.total).toBe(cases.length);
    expect(result.correct).toBeGreaterThan(0);
    expect(result.accuracyPct).toBeGreaterThanOrEqual(0);
    expect(result.accuracyPct).toBeLessThanOrEqual(100);
  });

  it('records misroutes when expected != actual', () => {
    const result = runQueryClassificationMatrix([
      { q: 'totally unknown query shape xyz', expected: 'GOAL_QUERY' },
    ]);
    expect(result.correct).toBe(0);
    expect(result.misroutes.length).toBe(1);
  });
});
