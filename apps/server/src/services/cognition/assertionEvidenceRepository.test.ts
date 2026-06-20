import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { chainableQuery } from '../../../tests/fixtures/cognitionSupabaseMock';
import { writeAssertionEvidence, getEvidenceForTarget } from './assertionEvidenceRepository';

describe('assertionEvidenceRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writeAssertionEvidence returns 0 for empty input', async () => {
    expect(await writeAssertionEvidence('user-1', [])).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('writeAssertionEvidence returns count on success', async () => {
    mockFrom.mockReturnValue(chainableQuery({ data: null, error: null }));
    const count = await writeAssertionEvidence('user-1', [
      {
        targetKind: 'narrative_claim',
        targetId: 'claim-1',
        evidenceKind: 'entry_ir',
        evidenceId: 'ir-1',
        weight: 0.8,
      },
    ]);
    expect(count).toBe(1);
    expect(mockFrom).toHaveBeenCalledWith('assertion_evidence');
  });

  it('writeAssertionEvidence returns 0 on upsert error', async () => {
    mockFrom.mockReturnValue(chainableQuery({ data: null, error: { message: 'conflict' } }));
    const count = await writeAssertionEvidence('user-1', [
      {
        targetKind: 'node',
        targetId: 'node-1',
        evidenceKind: 'characters',
        evidenceId: 'char-1',
      },
    ]);
    expect(count).toBe(0);
  });

  it('getEvidenceForTarget returns empty array on error', async () => {
    mockFrom.mockReturnValue(chainableQuery({ data: null, error: { message: 'fail' } }));
    expect(await getEvidenceForTarget('user-1', 'node', 'node-1')).toEqual([]);
  });
});
