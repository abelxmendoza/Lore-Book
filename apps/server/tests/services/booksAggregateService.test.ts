import { beforeEach, describe, expect, it, vi } from 'vitest';

type TableResult = { data: any; error: any; count?: number };

const tableResults: Record<string, TableResult> = {};

function makeChain(table: string) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve(tableResults[table] ?? { data: [], error: null, count: 0 })),
    then: (resolve: (value: TableResult) => void) =>
      resolve(tableResults[table] ?? { data: [], error: null, count: 0 }),
  };
  return chain;
}

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => makeChain(table)),
  },
}));

vi.mock('../../src/services/kinship/familyGraphService', () => ({
  familyGraphService: {},
}));

vi.mock('../../src/services/kinship/householdService', () => ({
  householdService: {},
}));

vi.mock('../../src/services/familyTreeService', () => ({
  familyTreeService: {},
}));

vi.mock('../../src/services/locationService', () => ({
  locationService: {},
}));

vi.mock('../../src/services/projectService', () => ({
  projectService: {},
}));

vi.mock('../../src/services/projects/projectSuggestionService', () => ({
  projectSuggestionService: {},
}));

vi.mock('../../src/services/skills/skillService', () => ({
  skillService: {},
}));

vi.mock('../../src/services/skills/skillSuggestionService', () => ({
  skillSuggestionService: {},
}));

import { loadCharactersBook } from '../../src/services/books/booksAggregateService';

describe('booksAggregateService.loadCharactersBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(tableResults)) delete tableResults[key];
  });

  it('keeps legacy null-status cards while filtering hidden, wrong-domain, and duplicate cards', async () => {
    tableResults.characters = {
      error: null,
      count: 7,
      data: [
        {
          id: 'cyberpunk-1',
          user_id: 'user-1',
          name: 'Cyberpunk',
          importance_score: 99,
          updated_at: '2026-06-01T00:00:00.000Z',
          status: 'active',
          metadata: { storyContext: 'I was talking about the video game Cyberpunk 2077.' },
        },
        {
          id: 'shana-old',
          user_id: 'user-1',
          name: 'Shana',
          importance_score: 5,
          updated_at: '2026-05-01T00:00:00.000Z',
          status: 'active',
          metadata: {},
        },
        {
          id: 'shana-new',
          user_id: 'user-1',
          name: 'Shana',
          importance_score: 12,
          updated_at: '2026-06-02T00:00:00.000Z',
          status: 'active',
          metadata: {},
        },
        {
          id: 'renna-1',
          user_id: 'user-1',
          name: 'Renna',
          importance_score: 8,
          updated_at: '2026-06-03T00:00:00.000Z',
          status: 'active',
          metadata: {},
        },
        {
          id: 'legacy-1',
          user_id: 'user-1',
          name: 'Legacy Friend',
          importance_score: 7,
          updated_at: '2026-06-04T00:00:00.000Z',
          status: null,
          metadata: {},
        },
        {
          id: 'archived-1',
          user_id: 'user-1',
          name: 'Archived Friend',
          importance_score: 7,
          updated_at: '2026-06-05T00:00:00.000Z',
          status: 'archived',
          metadata: {},
        },
        {
          id: 'reclassified-1',
          user_id: 'user-1',
          name: 'Vanguard Robotics',
          importance_score: 7,
          updated_at: '2026-06-06T00:00:00.000Z',
          status: 'reclassified',
          metadata: {},
        },
      ],
    };

    const book = await loadCharactersBook('user-1');

    expect(book.characters.map((c: any) => c.name)).toEqual(['Shana', 'Renna', 'Legacy Friend']);
    expect(book.characters.map((c: any) => c.id)).toEqual(['shana-new', 'renna-1', 'legacy-1']);
    expect(book.counts.characters).toBe(3);
    expect(book.duplicate_groups).toEqual([]);
  });
});
