import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const mockFrom = vi.fn();

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('./misclassifiedEntityRouter', () => ({
  misclassifiedEntityRouter: {
    retypeOrCreateOmegaEntity: vi.fn().mockResolvedValue('omega-event-1'),
  },
}));

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'insert', 'delete']) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.then = undefined;
  Object.assign(c, result);
  return c;
}

describe('characterMisclassificationRedistributionService', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('migrates facts for holidays before character delete', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'entity_facts') {
        return chain({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [{ id: 'f1', fact: 'Observed on last Monday in May', confidence: 0.9, first_seen_at: '2026-01-01', category: 'general' }],
                }),
              }),
            }),
          }),
        });
      }
      if (table === 'omega_claims') {
        return chain({
          insert: vi.fn().mockResolvedValue({ error: null }),
        });
      }
      if (table === 'character_identity_index') {
        return chain({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ data: [{ id: 'idx1' }] }),
              }),
            }),
          }),
        });
      }
      return chain({});
    });

    const { characterMisclassificationRedistributionService } = await import(
      './characterMisclassificationRedistributionService'
    );

    const report = await characterMisclassificationRedistributionService.redistributeBeforeDelete(
      'user-1',
      { id: 'char-1', name: 'Memorial Day', metadata: { omega_entity_id: 'omega-1' } }
    );

    expect(report.redistributed).toBe(true);
    expect(report.kind).toBe('holiday');
    expect(report.claimsCreated).toBe(1);
  });
});
