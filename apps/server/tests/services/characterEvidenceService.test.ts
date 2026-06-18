import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('../../src/services/provenance', () => ({
  provenanceEdgeService: {
    getEdgesForArtifact: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../src/services/entityFactsService', () => ({
  entityFactsService: {
    getEntityFacts: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../src/services/ingestion/userFileRegistry', () => ({
  userFileRegistry: {
    getForUser: vi.fn().mockResolvedValue(null),
    listForUser: vi.fn().mockResolvedValue([]),
  },
}));

import { getCharacterEvidenceLocker } from '../../src/services/characterEvidenceService';

function chain(result: { data?: unknown; error?: unknown }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    contains: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.contains.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue(result);
  builder.single.mockResolvedValue(result);
  return builder;
}

describe('characterEvidenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when character is missing', async () => {
    mockFrom.mockImplementation(() => chain({ data: null, error: { message: 'missing' } }));
    const result = await getCharacterEvidenceLocker('user-1', 'char-1');
    expect(result).toBeNull();
  });

  it('summarizes evidence items for a character', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain({
          data: { id: 'char-1', name: 'Maya', metadata: {} },
        });
      }
      if (table === 'journal_entries') {
        return chain({ data: [] });
      }
      return chain({ data: [] });
    });

    const locker = await getCharacterEvidenceLocker('user-1', 'char-1');
    expect(locker?.characterName).toBe('Maya');
    expect(locker?.summary).toContain('No supporting evidence');
  });
});
