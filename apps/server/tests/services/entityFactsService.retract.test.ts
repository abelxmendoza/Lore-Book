import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal in-memory entity_facts table that respects the .eq() chain used by
// getEntityFacts and the .update().in() call used by retractFactsMatching —
// enough to exercise real filtering behavior without a full Supabase double.
const { fromMock, rows } = vi.hoisted(() => {
  let rows: Record<string, unknown>[] = [];
  const fromMock = vi.fn((table: string) => {
    if (table !== 'entity_facts') throw new Error(`Unexpected table: ${table}`);

    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    let mode: 'select' | 'update' = 'select';
    let updatePayload: Record<string, unknown> = {};

    const q: Record<string, unknown> = {
      select: () => q,
      update: (payload: Record<string, unknown>) => {
        mode = 'update';
        updatePayload = payload;
        return q;
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return q;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push((r) => vals.includes(r[col]));
        return q;
      },
      order: () => q,
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        if (mode === 'update') {
          for (const r of matched) Object.assign(r, updatePayload);
          return resolve({ data: matched, error: null });
        }
        return resolve({ data: matched, error: null });
      },
    };
    return q;
  });
  return { fromMock, get rows() { return rows; }, set rows(v: Record<string, unknown>[]) { rows = v; } };
});

vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock('../../src/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { entityFactsService } from '../../src/services/entityFactsService';

describe('entityFactsService.retractFactsMatching', () => {
  beforeEach(() => {
    fromMock.mockClear();
    rows.length = 0;
    rows.push(
      {
        id: 'f1', user_id: 'u1', entity_id: 'char-1', entity_type: 'character',
        category: 'relationship', fact: 'Member of Ska Collective (drummer)', status: 'active',
      },
      {
        id: 'f2', user_id: 'u1', entity_id: 'char-1', entity_type: 'character',
        category: 'relationship', fact: 'Best friends with Shy La', status: 'active',
      },
      {
        id: 'f3', user_id: 'u1', entity_id: 'char-1', entity_type: 'character',
        category: 'goals', fact: 'Wants to join Ska Collective someday', status: 'active',
      },
    );
  });

  it('marks only matching active facts in the given category as contradicted', async () => {
    await entityFactsService.retractFactsMatching('u1', 'char-1', 'character', 'relationship', 'Ska Collective');

    expect(rows.find((r) => r.id === 'f1')?.status).toBe('contradicted');
    expect(rows.find((r) => r.id === 'f2')?.status).toBe('active');
    // Different category, same substring — must not be touched.
    expect(rows.find((r) => r.id === 'f3')?.status).toBe('active');
  });

  it('is a no-op when nothing matches', async () => {
    await entityFactsService.retractFactsMatching('u1', 'char-1', 'character', 'relationship', 'Nonexistent Group');

    expect(rows.every((r) => r.status === 'active')).toBe(true);
  });

  it('ignores an empty match string', async () => {
    await entityFactsService.retractFactsMatching('u1', 'char-1', 'character', 'relationship', '   ');
    expect(rows.every((r) => r.status === 'active')).toBe(true);
  });
});
