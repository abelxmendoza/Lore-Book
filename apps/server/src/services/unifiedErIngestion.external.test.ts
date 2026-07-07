/**
 * External-post lore intake gate: existing lore is always referenceable,
 * new-entity creation routes by intake mode, and junk person candidates are
 * dropped in every mode.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./entityResolutionCache', () => ({
  entityResolutionCache: {
    getCachedResolution: vi.fn().mockResolvedValue(null),
    cacheResolution: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('./omegaMemoryService', () => ({
  omegaMemoryService: {
    findEntityByNameOrAlias: vi.fn().mockResolvedValue(null),
    extractEntities: vi.fn(),
    resolveEntities: vi.fn(),
  },
}));

import { partitionExternalPostCandidates } from './unifiedErIngestion';
import { entityResolutionCache } from './entityResolutionCache';
import { omegaMemoryService } from './omegaMemoryService';

const USER = 'user-1';

beforeEach(() => {
  vi.mocked(entityResolutionCache.getCachedResolution).mockResolvedValue(null);
  vi.mocked(omegaMemoryService.findEntityByNameOrAlias).mockResolvedValue(null);
});

describe('partitionExternalPostCandidates', () => {
  it('existing entities are referenced in every mode, even reference_only', async () => {
    vi.mocked(omegaMemoryService.findEntityByNameOrAlias).mockResolvedValue({
      id: 'e1',
      user_id: USER,
      type: 'PERSON',
      primary_name: 'Marcus',
      aliases: [],
      created_at: '',
      updated_at: '',
    } as never);

    const result = await partitionExternalPostCandidates(
      USER,
      [{ name: 'Marcus', type: 'PERSON' }],
      'hung out with Marcus, he was great',
      'reference_only',
    );
    expect(result.existing).toHaveLength(1);
    expect(result.fresh).toHaveLength(0);
    expect(result.held).toHaveLength(0);
  });

  it('reference_only holds all new candidates instead of creating', async () => {
    const result = await partitionExternalPostCandidates(
      USER,
      [{ name: 'Night Market', type: 'PLACE' }],
      'walked through the night market downtown',
      'reference_only',
    );
    expect(result.fresh).toHaveLength(0);
    expect(result.held.map((c) => c.name)).toEqual(['Night Market']);
  });

  it('review_first holds new candidates for confirmation', async () => {
    const result = await partitionExternalPostCandidates(
      USER,
      [{ name: 'Night Market', type: 'PLACE' }],
      'walked through the night market downtown',
      'review_first',
    );
    expect(result.fresh).toHaveLength(0);
    expect(result.held).toHaveLength(1);
  });

  it('conservative creates within the per-post budget and holds the overflow', async () => {
    const result = await partitionExternalPostCandidates(
      USER,
      [
        { name: 'Night Market', type: 'PLACE' },
        { name: 'Neon Alley', type: 'PLACE' },
        { name: 'Third Spot', type: 'PLACE' },
      ],
      'went from the night market to neon alley then a third spot',
      'conservative',
    );
    expect(result.fresh.map((c) => c.name)).toEqual(['Night Market', 'Neon Alley']);
    expect(result.held.map((c) => c.name)).toEqual(['Third Spot']);
  });

  it('drops person candidates without human evidence in every mode', async () => {
    for (const mode of ['reference_only', 'conservative', 'review_first'] as const) {
      const result = await partitionExternalPostCandidates(
        USER,
        [{ name: 'Weeb City', type: 'PERSON' }],
        'weeb city https://t.co/xyz',
        mode,
      );
      expect(result.fresh).toHaveLength(0);
      expect(result.held).toHaveLength(0);
    }
  });

  it('keeps person candidates with a person-shaped name and post evidence', async () => {
    const result = await partitionExternalPostCandidates(
      USER,
      [{ name: 'Trinidad Vega', type: 'PERSON' }],
      'met Trinidad Vega after the set, she was hilarious',
      'conservative',
    );
    expect(result.fresh.map((c) => c.name)).toEqual(['Trinidad Vega']);
  });
});
