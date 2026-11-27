import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/requestCache', () => ({
  cachedFetchJson: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../../lib/api';
import { cachedFetchJson } from '../../lib/requestCache';

import {
  canEditKnowledgeFactText,
  canMutateKnowledgeFact,
  CharacterKnowledgeBase,
} from './CharacterKnowledgeBase';

const mockCachedFetch = cachedFetchJson as ReturnType<typeof vi.fn>;
const mockFetchJson = fetchJson as ReturnType<typeof vi.fn>;

const FACT_ID = '11111111-1111-4111-8111-111111111111';
const ATTR_ID = '22222222-2222-4222-8222-222222222222';
const CHARACTER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('knowledge fact mutation helpers', () => {
  it('allows editing real entity facts and removing attribute-backed rows', () => {
    expect(canMutateKnowledgeFact(FACT_ID)).toBe(true);
    expect(canEditKnowledgeFactText(FACT_ID)).toBe(true);
    expect(canMutateKnowledgeFact(`attr-${ATTR_ID}`)).toBe(true);
    expect(canEditKnowledgeFactText(`attr-${ATTR_ID}`)).toBe(false);
    expect(canMutateKnowledgeFact('attr-occupation-engineer')).toBe(false);
  });
});

describe('CharacterKnowledgeBase fact corrections for other characters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCachedFetch.mockResolvedValue({
      success: true,
      knowledgeBase: {
        characterId: CHARACTER_ID,
        name: 'Jamie',
        aliases: [],
        summary: null,
        identityMentions: [],
        profile: {
          relationshipToUser: 'friend',
          memoryCount: 1,
          timelineEventCount: 0,
          timelineEvents: [],
        },
        facts: [
          {
            id: FACT_ID,
            category: 'career',
            fact: 'Works at Vanguard Robotics',
            confidence: 0.9,
            status: 'active',
          },
          {
            id: `attr-${ATTR_ID}`,
            category: 'career',
            fact: 'Works as engineer',
            confidence: 0.8,
            metadata: { source: 'entity_attributes' },
          },
        ],
        knowledgeClaims: [],
        sceneCandidates: [],
        relatedEntities: [],
        conversationLinks: [],
        intelligence: {
          totalEvidenceItems: 2,
          lastUpdated: '2026-07-01T00:00:00.000Z',
          learningScore: 40,
        },
      },
    });
  });

  it('shows Edit/Remove for other characters without isSelfProfile', async () => {
    render(
      <MemoryRouter>
        <CharacterKnowledgeBase
          characterId={CHARACTER_ID}
          characterName="Jamie"
          active
        />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId(`arm-edit-fact-${FACT_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId(`arm-remove-fact-${FACT_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId(`arm-remove-fact-attr-${ATTR_ID}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`arm-edit-fact-attr-${ATTR_ID}`)).not.toBeInTheDocument();
  });

  it('patches entity facts and deletes attribute-backed facts', async () => {
    mockFetchJson
      .mockResolvedValueOnce({
        success: true,
        fact: { id: FACT_ID, fact: 'Used to work at Vanguard Robotics', status: 'corrected' },
      })
      .mockResolvedValueOnce({ success: true, attributeId: ATTR_ID });

    render(
      <MemoryRouter>
        <CharacterKnowledgeBase
          characterId={CHARACTER_ID}
          characterName="Jamie"
          active
        />
      </MemoryRouter>,
    );

    await screen.findByTestId(`arm-edit-fact-${FACT_ID}`);
    fireEvent.click(screen.getByTestId(`arm-edit-fact-${FACT_ID}`));
    fireEvent.change(screen.getByDisplayValue('Works at Vanguard Robotics'), {
      target: { value: 'Used to work at Vanguard Robotics' },
    });
    fireEvent.click(screen.getByTestId(`confirm-save-fact-${FACT_ID}`));

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith(
        `/api/characters/${CHARACTER_ID}/facts/${FACT_ID}`,
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    fireEvent.click(screen.getByTestId(`arm-remove-fact-attr-${ATTR_ID}`));
    fireEvent.click(screen.getByTestId(`confirm-remove-fact-attr-${ATTR_ID}`));

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith(
        `/api/characters/${CHARACTER_ID}/attributes/${ATTR_ID}`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});
