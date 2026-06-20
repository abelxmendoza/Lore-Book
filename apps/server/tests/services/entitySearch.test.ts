import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchEntities,
  validateEntityOwnership,
} from '../../src/services/search/entitySearchService';

vi.mock('../../src/services/entities/certifiedEntityIndexService', () => ({
  listCertifiedEntities: vi.fn(),
}));

vi.mock('../../src/services/entities/entityMentionIndexService', () => ({
  listMentionableEntities: vi.fn(),
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      then: vi.fn((cb: (r: { data: unknown[] }) => unknown) =>
        Promise.resolve(cb({ data: [] }))
      ),
    })),
  },
}));

import { listCertifiedEntities } from '../../src/services/entities/certifiedEntityIndexService';
import { listMentionableEntities } from '../../src/services/entities/entityMentionIndexService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

describe('entitySearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listMentionableEntities).mockResolvedValue([
      {
        id: 'oscar-id',
        name: 'Oscar Trujillo',
        type: 'character',
        aliases: ['Oscar'],
        mentionKeys: ['oscar trujillo', 'oscar'],
        status: 'confirmed',
      },
      {
        id: 'coding-club',
        name: 'Coding Club',
        type: 'organization',
        aliases: [],
        mentionKeys: ['coding club'],
        status: 'confirmed',
      },
    ] as never);
    vi.mocked(listCertifiedEntities).mockResolvedValue([
      {
        id: 'oscar-id',
        name: 'Oscar Trujillo',
        type: 'character',
        aliases: ['Oscar'],
        mentionKeys: ['oscar trujillo', 'oscar'],
      },
      {
        id: 'coding-club',
        name: 'Coding Club',
        type: 'organization',
        aliases: [],
        mentionKeys: ['coding club'],
      },
    ] as never);
  });

  it('returns exact name matches first', async () => {
    const { results } = await searchEntities({
      userId: 'user-1',
      query: 'Oscar Trujillo',
      types: ['person'],
      limit: 10,
    });

    expect(results[0]?.displayName).toBe('Oscar Trujillo');
    expect(results[0]?.matchKind).toBe('exact');
  });

  it('returns alias matches', async () => {
    const { results } = await searchEntities({
      userId: 'user-1',
      query: 'Oscar',
      types: ['person'],
    });

    expect(results.some((r) => r.displayName === 'Oscar Trujillo')).toBe(true);
    expect(results.some((r) => r.matchKind === 'alias')).toBe(true);
  });

  it('respects type filters', async () => {
    const { results } = await searchEntities({
      userId: 'user-1',
      query: 'Coding Club',
      types: ['group', 'organization'],
    });

    expect(results.every((r) => r.entityType === 'organization' || r.entityType === 'group')).toBe(true);
  });

  it('validateEntityOwnership returns true for owned character', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'oscar-id' } }),
    } as never);

    const owned = await validateEntityOwnership('user-1', 'oscar-id', 'person');
    expect(owned).toBe(true);
  });

  it('validateEntityOwnership rejects unknown entity', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    } as never);

    const owned = await validateEntityOwnership('user-1', 'other-user-entity', 'person');
    expect(owned).toBe(false);
  });
});
