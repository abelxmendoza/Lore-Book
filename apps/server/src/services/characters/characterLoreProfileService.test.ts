import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

vi.mock('../conversationCentered/entityAttributeDetector', () => ({
  entityAttributeDetector: {
    getEntityAttributes: vi.fn().mockResolvedValue([
      {
        attributeType: 'skill',
        attributeValue: 'Python',
        confidence: 0.9,
        evidence: 'She writes Python daily',
      },
      {
        attributeType: 'hobby',
        attributeValue: 'Rock climbing',
        confidence: 0.85,
        evidence: 'Goes climbing every weekend',
      },
    ]),
  },
}));

vi.mock('../entityFactsService', () => ({
  entityFactsService: {
    getEntityFacts: vi.fn().mockResolvedValue([
      { id: 'f1', fact: 'Lives in Portland', category: 'location', confidence: 0.8, last_confirmed_at: '2024-01-01' },
    ]),
  },
}));

vi.mock('../relationshipPeripheralService', () => ({
  listPeripheralsForCharacter: vi.fn().mockResolvedValue([]),
}));

vi.mock('../organizationService', () => ({
  organizationService: {
    getOrganizationsByCharacter: vi.fn().mockResolvedValue([
      { id: 'org-1', name: 'Design Team', type: 'team', members: [{ character_id: 'char-1', role: 'member' }] },
    ]),
  },
}));

import { chainableQuery } from '../../../tests/fixtures/cognitionSupabaseMock';
import {
  compileCharacterLoreProfile,
  findCoMentionedCharacterIds,
} from './characterLoreProfileService';

describe('characterLoreProfileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findCoMentionedCharacterIds matches roster names in text', async () => {
    mockFrom.mockReturnValue(
      chainableQuery({
        data: [
          { id: 'c1', name: 'Sarah Chen', alias: ['Sarah'] },
          { id: 'c2', name: 'Marcus', alias: [] },
        ],
        error: null,
      }),
    );
    const ids = await findCoMentionedCharacterIds('user-1', 'Had coffee with Sarah about LoreBook');
    expect(ids).toContain('c1');
    expect(ids).not.toContain('c2');
  });

  it('compileCharacterLoreProfile aggregates skills, hobbies, groups', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chainableQuery({
          data: {
            id: 'char-1',
            name: 'Ada',
            tags: ['engineer'],
            metadata: { context_hooks: ['Built the first prototype'] },
            has_met: true,
            proximity_level: 'direct',
            relationship_depth: 'close',
            associated_with_character_ids: [],
            mentioned_by_character_ids: [],
          },
          error: null,
        });
      }
      if (table === 'interests') {
        return chainableQuery({
          data: [
            {
              id: 'int-1',
              interest_name: 'Chess',
              interest_category: 'hobby',
              interest_level: 0.7,
              evidence_quotes: ['She loves chess'],
              last_mentioned_at: '2024-06-01',
            },
          ],
          error: null,
        });
      }
      if (table === 'character_relationships') {
        return chainableQuery({ data: [], error: null });
      }
      if (table === 'character_organizations') {
        return chainableQuery({ data: null, error: { code: 'PGRST205' } });
      }
      return chainableQuery({ data: null, error: null });
    });

    const profile = await compileCharacterLoreProfile('user-1', 'char-1');
    expect(profile).not.toBeNull();
    expect(profile!.skills.some((s) => s.label === 'Python')).toBe(true);
    expect(profile!.hobbies.some((h) => h.label === 'Rock climbing' || h.label === 'Chess')).toBe(true);
    expect(profile!.groups.some((g) => g.name === 'Design Team')).toBe(true);
    expect(profile!.mentionOnly).toBe(false);
  });

  it('marks mention-only characters when user has not met them', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chainableQuery({
          data: {
            id: 'char-2',
            name: 'Celebrity X',
            tags: [],
            metadata: {},
            has_met: false,
            proximity_level: 'unmet',
            relationship_depth: 'mentioned_only',
            context_of_mention: 'Referenced in a podcast',
            associated_with_character_ids: [],
            mentioned_by_character_ids: [],
          },
          error: null,
        });
      }
      if (table === 'interests') return chainableQuery({ data: [], error: null });
      if (table === 'character_relationships') return chainableQuery({ data: [], error: null });
      if (table === 'character_organizations') return chainableQuery({ data: null, error: { code: 'PGRST205' } });
      return chainableQuery({ data: null, error: null });
    });

    const profile = await compileCharacterLoreProfile('user-1', 'char-2');
    expect(profile?.mentionOnly).toBe(true);
    expect(profile?.loreSnippets.some((s) => s.label.includes('podcast'))).toBe(true);
  });
});
