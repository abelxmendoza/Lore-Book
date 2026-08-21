import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('./characterIdentityLoader', () => ({
  loadCharacterIdentity: vi.fn(),
}));

vi.mock('../characterKnowledgeBaseService', () => ({
  getCharacterKnowledgeBase: vi.fn().mockResolvedValue({
    characterId: 'c1',
    name: 'Jamie',
    aliases: [],
    summary: null,
    identityMentions: [],
    profile: { relationshipToUser: 'friend', memoryCount: 0, timelineEventCount: 0, timelineEvents: [] },
    facts: [],
    knowledgeClaims: [],
    sceneCandidates: [],
    relatedEntities: [],
    conversationLinks: [],
    intelligence: { totalEvidenceItems: 0, lastUpdated: null, learningScore: 0 },
  }),
}));

vi.mock('./characterLoreProfileService', () => ({
  characterLoreProfileService: {
    compile: vi.fn().mockResolvedValue({
      characterId: 'c1',
      characterName: 'Jamie',
      generatedAt: new Date().toISOString(),
      skills: [],
      hobbies: [],
      interests: [],
      groups: [],
      people: [],
      loreSnippets: [],
      mentionOnly: false,
    }),
  },
}));

vi.mock('../conversationCentered/entityAttributeDetector', () => ({
  entityAttributeDetector: {
    getEntityAttributes: vi.fn().mockResolvedValue([
      { attributeType: 'occupation', attributeValue: 'engineer', confidence: 0.9 },
    ]),
  },
}));

vi.mock('../organizationService', () => ({
  organizationService: {
    getOrganizationsByCharacter: vi.fn().mockResolvedValue([{ id: 'org1', name: 'Northwind Labs' }]),
  },
}));

vi.mock('../conversationCentered/entityConversationLinkService', () => ({
  entityConversationLinkService: {
    getThreadsForEntity: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../provenance/provenanceEdgeService', () => ({
  provenanceEdgeService: {
    getEntityProvenance: vi.fn().mockResolvedValue({
      sourceMessageIds: [],
      edges: [],
    }),
  },
}));

vi.mock('../familyTreeService', () => ({
  familyTreeService: {
    getCharacterFamilyTree: vi.fn().mockResolvedValue({ members: [], edges: [] }),
  },
}));

vi.mock('../conversationCentered/characterTimelineBuilder', () => ({
  characterTimelineBuilder: {
    buildTimelines: vi.fn().mockResolvedValue({ sharedExperiences: [], lore: [] }),
  },
}));

vi.mock('../characterEvidenceService', () => ({
  getCharacterEvidenceLocker: vi.fn().mockResolvedValue({ items: [] }),
}));

vi.mock('./characterRelationshipAuthorityService', () => ({
  getCurrentCharacterRelationship: vi.fn(),
}));

describe('getCharacterQuery', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { loadCharacterIdentity } = await import('./characterIdentityLoader');
    (loadCharacterIdentity as any).mockResolvedValue({
      id: 'c1',
      name: 'Jamie',
      alias: [],
      status: 'active',
      context_hooks: [],
      ontology_tags: [],
      tags: [],
      metadata: {},
      associated_with_character_ids: [],
      mentioned_by_character_ids: [],
      memory_count: 0,
      relationship_count: 0,
      relationships: [],
      shared_memories: [],
    });

    const { supabaseAdmin } = await import('../supabaseClient');
    (supabaseAdmin as any).from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
            in: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            single: () => Promise.resolve({ data: null, error: null }),
          }),
          in: () => Promise.resolve({ data: [], error: null }),
          ilike: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
            limit: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }));
  });

  it('returns core sections by default', async () => {
    const { getCharacterQuery } = await import('./characterQueryService');
    const query = await getCharacterQuery('user-1', 'c1');
    expect(query).not.toBeNull();
    expect(query!.characterId).toBe('c1');
    expect(query!.sections.identity?.name).toBe('Jamie');
    expect(query!.sections.attributes?.current.length).toBeGreaterThan(0);
    expect(query!.sections.lore).toBeTruthy();
    expect(query!.sections.knowledge).toBeTruthy();
    expect(query!.sections.organizations).toEqual([{ id: 'org1', name: 'Northwind Labs' }]);
    expect(query!.sections.family).toBeUndefined();
  });

  it('loads lazy family section when requested', async () => {
    const { getCharacterQuery } = await import('./characterQueryService');
    const query = await getCharacterQuery('user-1', 'c1', { sections: 'identity,family' });
    expect(query!.sections.identity).toBeTruthy();
    expect(query!.sections.family).toEqual({ members: [], edges: [] });
    expect(query!.sections.lore).toBeUndefined();
  });

  it('returns the authority-aware current relationship projection per counterpart, not the raw cache row', async () => {
    const { supabaseAdmin } = await import('../supabaseClient');
    (supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table === 'character_relationships') {
        return {
          select: () => ({
            eq: () => ({
              or: () =>
                Promise.resolve({
                  data: [{ source_character_id: 'c1', target_character_id: 'jamie-id' }],
                  error: null,
                }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
              in: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              single: () => Promise.resolve({ data: null, error: null }),
            }),
            in: () => Promise.resolve({ data: [], error: null }),
            ilike: () => ({
              order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
              limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
            order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          }),
        }),
      };
    });

    const { getCurrentCharacterRelationship } = await import('./characterRelationshipAuthorityService');
    (getCurrentCharacterRelationship as any).mockResolvedValue({
      current: { type: 'estranged', status: 'inactive', authority: 'USER_EXPLICIT', changedAt: '2026-08-01T00:00:00Z', confidence: null, evidenceIds: [], isMigratedBaseline: false },
      history: [{ toRelationshipType: 'friend', toStatus: 'active' }],
      correctedAssertions: [],
      unresolvedConflicts: [],
    });

    const { getCharacterQuery } = await import('./characterQueryService');
    const query = await getCharacterQuery('user-1', 'c1', { sections: 'identity,relationships' });

    expect(query!.sections.relationships?.['jamie-id']?.current?.type).toBe('estranged');
    expect(query!.sections.relationships?.['jamie-id']?.history).toHaveLength(1);
    expect(getCurrentCharacterRelationship).toHaveBeenCalledWith('user-1', 'c1', 'jamie-id');
  });
});
