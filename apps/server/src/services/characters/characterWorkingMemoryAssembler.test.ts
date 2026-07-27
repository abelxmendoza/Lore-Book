import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./characterQueryService', () => ({
  getCharacterQuery: vi.fn(),
}));

describe('assembleCharacterWorkingMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats identity + knowledge into working-memory text', async () => {
    const { getCharacterQuery } = await import('./characterQueryService');
    (getCharacterQuery as any).mockResolvedValue({
      characterId: 'c1',
      subject: 'other',
      generatedAt: '2026-01-01T00:00:00.000Z',
      sections: {
        identity: {
          id: 'c1',
          name: 'Jamie',
          role: 'engineer',
          summary: 'Works at Northwind Labs',
          metadata: { relationship_to_user: 'coworker' },
          relationships: [{ character_name: 'Alex', relationship_type: 'friend' }],
          alias: [],
        },
        knowledge: {
          facts: [{ fact: 'Jamie builds robotics tooling' }],
          knowledgeClaims: [],
          profile: { relationshipToUser: 'coworker' },
        },
      },
    });

    const { assembleCharacterWorkingMemory } = await import('./characterWorkingMemoryAssembler');
    const block = await assembleCharacterWorkingMemory('user-1', 'c1', 'who_is');
    expect(block).not.toBeNull();
    expect(block!.characterName).toBe('Jamie');
    expect(block!.text).toContain('# Character: Jamie');
    expect(block!.text).toContain('Works at Northwind Labs');
    expect(block!.text).toContain('Jamie builds robotics tooling');
    expect(block!.sectionKeys).toContain('identity');
  });
});
