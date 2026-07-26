import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/requestCache', () => ({
  cachedFetchJson: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

import { cachedFetchJson } from '../../lib/requestCache';
import { CharacterKnowledgeBase } from './CharacterKnowledgeBase';

const mockCachedFetch = cachedFetchJson as ReturnType<typeof vi.fn>;

describe('CharacterKnowledgeBase self Lore tab wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches knowledge-base even when thin initialData is provided', async () => {
    mockCachedFetch.mockResolvedValue({
      success: true,
      knowledgeBase: {
        characterId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        name: 'Alex',
        aliases: [],
        summary: 'Builder',
        identityMentions: [],
        profile: {
          relationshipToUser: null,
          memoryCount: 2,
          timelineEventCount: 7,
          timelineEvents: [{ title: 'Joined Vanguard', type: 'career', date: '2024-01-01', summary: null }],
        },
        facts: [
          {
            id: 'f1',
            category: 'career',
            fact: 'Works at Vanguard Robotics',
            confidence: 0.9,
            status: 'active',
          },
        ],
        knowledgeClaims: [
          {
            id: 'c1',
            human_readable_claim: 'Recurring builder pattern',
            confidence: 0.8,
            knowledge_type: 'pattern',
          },
        ],
        sceneCandidates: [],
        relatedEntities: [],
        conversationLinks: [],
        intelligence: {
          totalEvidenceItems: 10,
          lastUpdated: '2026-07-01T00:00:00.000Z',
          learningScore: 64,
        },
      },
    });

    render(
      <MemoryRouter>
        <CharacterKnowledgeBase
          characterId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
          characterName="Alex"
          active
          isSelfProfile
          initialData={{
            characterId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            name: 'Alex',
            summary: 'seed',
            facts: [],
            knowledgeClaims: [],
            profile: {
              relationshipToUser: null,
              memoryCount: 0,
              timelineEventCount: 0,
              timelineEvents: [],
            },
            intelligence: { totalEvidenceItems: 0, lastUpdated: null, learningScore: 0 },
          }}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockCachedFetch).toHaveBeenCalledWith(
        '/api/characters/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/knowledge-base',
        expect.any(Object),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Recurring builder pattern')).toBeTruthy();
    });

    // Timeline pill should reflect real KB count, not seeded 0
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);
  });
});
