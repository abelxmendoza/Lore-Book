import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { chainableQuery } from '../../../tests/fixtures/cognitionSupabaseMock';
import { toClaimRow, upsertClaimBySource } from './narrativeClaimRepository';

describe('narrativeClaimRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toClaimRow sets epistemic_state from confidence when not provided', () => {
    const row = toClaimRow('user-1', {
      claimKind: 'event',
      statement: 'Graduation',
      confidence: 0.92,
    });
    expect(row.epistemic_state).toBe('VERIFIED');
    expect(row.extraction_method).toBeNull();
  });

  it('toClaimRow respects explicit epistemicState override', () => {
    const row = toClaimRow('user-1', {
      claimKind: 'decision',
      statement: 'Quit my job',
      epistemicState: 'CONTRADICTED',
      confidence: 0.9,
    });
    expect(row.epistemic_state).toBe('CONTRADICTED');
  });

  it('upsertClaimBySource inserts when no source pair exists', async () => {
    let claimsCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'narrative_claims') {
        claimsCalls += 1;
        if (claimsCalls === 1) {
          return chainableQuery({ data: null, error: null });
        }
        return chainableQuery({
          data: { id: 'claim-new', claim_kind: 'fact', statement: 'Test' },
          error: null,
        });
      }
      return chainableQuery({ data: null, error: null });
    });

    const claim = await upsertClaimBySource('user-1', {
      claimKind: 'fact',
      statement: 'Test fact',
      sourceTable: 'entry_ir',
      sourceId: 'ir-1',
    });

    expect(claim?.id).toBe('claim-new');
  });

  it('upsertClaimBySource returns null on insert error', async () => {
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      if (call === 1) return chainableQuery({ data: null, error: null });
      return chainableQuery({ data: null, error: { message: 'insert failed' } });
    });

    const claim = await upsertClaimBySource('user-1', {
      claimKind: 'event',
      statement: 'Failed',
      sourceTable: 'resolved_events',
      sourceId: 'evt-1',
    });

    expect(claim).toBeNull();
  });
});
