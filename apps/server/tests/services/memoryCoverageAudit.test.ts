import { beforeEach, describe, expect, it, vi } from 'vitest';

type TableResult = { data: any; error: unknown; count?: number };

function makeChain(result: TableResult) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    limit: () => chain,
    then: (resolve: (v: TableResult) => void) => resolve(result),
  };
  return chain;
}

let tableResults: Record<string, TableResult> = {};

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => makeChain(tableResults[table] ?? { data: [], error: null })),
  },
}));

import { buildMemoryCoverageAudit } from '../../src/services/diagnostics/memoryCoverageAudit';

describe('memoryCoverageAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults = {
      characters: {
        data: [
          { id: 'char-covered', name: 'Alex' },
          { id: 'char-orphan', name: 'Empty Card' },
        ],
        error: null,
      },
      people_places: {
        data: [
          { id: 'pp-place', name: 'Blue Room', type: 'place', related_entries: ['entry-1'] },
        ],
        error: null,
      },
      omega_entities: {
        data: [
          { id: 'omega-empty', primary_name: 'Unknown Thing', type: 'UNKNOWN', mention_count: 0 },
        ],
        error: null,
      },
      character_memories: { data: [{ character_id: 'char-covered' }], error: null },
      character_timeline_events: { data: [{ character_id: 'char-covered' }], error: null },
      character_relationships: {
        data: [{ source_character_id: 'char-covered', target_character_id: 'self' }],
        error: null,
      },
      entity_facts: {
        data: [{ entity_id: 'char-covered', entity_type: 'character' }],
        error: null,
      },
      omega_claims: { data: [], error: null },
      omega_relationships: { data: [], error: null },
    };
  });

  it('scores covered entities above orphans', async () => {
    const report = await buildMemoryCoverageAudit('user-1');
    const covered = report.entities.find((entity) => entity.id === 'char-covered');
    const orphan = report.entities.find((entity) => entity.id === 'char-orphan');

    expect(report.summary.totalEntities).toBe(4);
    expect(covered?.coverageScore).toBeGreaterThan(0);
    expect(orphan?.coverageScore).toBe(0);
    expect(orphan?.gaps).toEqual(['no episodes', 'no events', 'no relationships', 'no evidence']);
    expect(report.summary.orphaned).toBeGreaterThanOrEqual(2);
  });
});
