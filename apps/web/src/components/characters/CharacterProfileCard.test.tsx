// =====================================================
// CHARACTER PROFILE CARD TESTS
// Includes "distant but high impact" badge behavior
// =====================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../test/utils';
import { CharacterProfileCard, type Character } from './CharacterProfileCard';
import { fetchJson } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn().mockResolvedValue({ attributes: [] }),
}));

// The card's self-fetch path is gated on an authenticated runtime; force it on
// so the controlled-vs-self-fetch behavior is actually exercised in tests.
vi.mock('../../lib/runtimeIdentity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/runtimeIdentity')>()),
  canCallAuthenticatedApi: () => true,
}));

const baseCharacter: Character = {
  id: 'char-1',
  name: 'Test Person',
  role: 'Friend',
  summary: 'A test character',
  importance_level: 'supporting',
};

describe('CharacterProfileCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders character name', () => {
    render(<CharacterProfileCard character={baseCharacter} />);
    expect(screen.getByText('Test Person')).toBeInTheDocument();
  });

  it('self-fetches attributes when no attributes prop is provided (standalone usage)', async () => {
    render(<CharacterProfileCard character={baseCharacter} />);
    await waitFor(() => {
      expect(fetchJson).toHaveBeenCalledWith(
        expect.stringContaining(`/api/characters/${baseCharacter.id}/attributes`)
      );
    });
  });

  it('renders provided attributes and skips the per-card fetch (controlled/batched usage)', async () => {
    render(
      <CharacterProfileCard
        character={baseCharacter}
        attributes={[
          { id: 'a1', attributeType: 'occupation', attributeValue: 'Barista', confidence: 0.9, isCurrent: true },
        ]}
      />
    );
    expect(screen.getByText('Barista')).toBeInTheDocument();
    // Controlled mode must not trigger the N+1 per-card request.
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('renders importance badge when importance_level is set', () => {
    render(<CharacterProfileCard character={{ ...baseCharacter, importance_level: 'major' }} />);
    expect(screen.getAllByText('Major').length).toBeGreaterThan(0);
  });

  it('shows "High impact" badge when minor/background and character_influence_on_user >= 70', async () => {
    render(
      <CharacterProfileCard
        character={{
          ...baseCharacter,
          importance_level: 'minor',
          analytics: {
            closeness_score: 50,
            relationship_depth: 50,
            interaction_frequency: 30,
            recency_score: 50,
            character_influence_on_user: 75,
            user_influence_over_character: 40,
            importance_score: 30,
            priority_score: 50,
            relevance_score: 50,
            value_score: 50,
            sentiment_score: 50,
            trust_score: 50,
            support_score: 50,
            conflict_score: 20,
            engagement_score: 50,
            activity_level: 30,
            shared_experiences: 5,
            relationship_duration_days: 100,
            trend: 'stable',
          },
        }}
      />
    );
    // Compact "High impact" label; full explanation lives in the title tooltip.
    expect(screen.getAllByTitle('Rare in your story, but high impact on you').length).toBeGreaterThan(0);
    expect(screen.getByText(/High impact/i)).toBeInTheDocument();
  });

  it('shows high-impact badge when background and influence >= 70', async () => {
    render(
      <CharacterProfileCard
        character={{
          ...baseCharacter,
          importance_level: 'background',
          analytics: {
            closeness_score: 20,
            relationship_depth: 20,
            interaction_frequency: 10,
            recency_score: 30,
            character_influence_on_user: 80,
            user_influence_over_character: 10,
            importance_score: 15,
            priority_score: 30,
            relevance_score: 40,
            value_score: 60,
            sentiment_score: 50,
            trust_score: 40,
            support_score: 50,
            conflict_score: 10,
            engagement_score: 30,
            activity_level: 20,
            shared_experiences: 2,
            relationship_duration_days: 30,
            trend: 'stable',
          },
        }}
      />
    );
    await waitFor(() => {
      expect(screen.getAllByTitle('Rare in your story, but high impact on you').length).toBeGreaterThan(0);
    });
  });

  it('does not show high-impact badge when major and high influence', async () => {
    render(
      <CharacterProfileCard
        character={{
          ...baseCharacter,
          importance_level: 'major',
          analytics: {
            closeness_score: 80,
            relationship_depth: 80,
            interaction_frequency: 70,
            recency_score: 80,
            character_influence_on_user: 85,
            user_influence_over_character: 60,
            importance_score: 85,
            priority_score: 80,
            relevance_score: 85,
            value_score: 80,
            sentiment_score: 70,
            trust_score: 80,
            support_score: 80,
            conflict_score: 20,
            engagement_score: 80,
            activity_level: 75,
            shared_experiences: 20,
            relationship_duration_days: 365,
            trend: 'deepening',
          },
        }}
      />
    );
    expect(screen.queryByTitle('Rare in your story, but high impact on you')).not.toBeInTheDocument();
  });

  it('does not show high-impact badge when minor but influence < 70', async () => {
    render(
      <CharacterProfileCard
        character={{
          ...baseCharacter,
          importance_level: 'minor',
          analytics: {
            closeness_score: 30,
            relationship_depth: 30,
            interaction_frequency: 20,
            recency_score: 40,
            character_influence_on_user: 50,
            user_influence_over_character: 30,
            importance_score: 25,
            priority_score: 30,
            relevance_score: 35,
            value_score: 40,
            sentiment_score: 50,
            trust_score: 40,
            support_score: 40,
            conflict_score: 15,
            engagement_score: 30,
            activity_level: 25,
            shared_experiences: 3,
            relationship_duration_days: 60,
            trend: 'stable',
          },
        }}
      />
    );
    await waitFor(() => {
      expect(screen.queryByTitle('Rare in your story, but high impact on you')).not.toBeInTheDocument();
    });
  });
});
