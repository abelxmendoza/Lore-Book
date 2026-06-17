/**
 * Integration tests using REAL mock lore data (no romanticRelationships vi.mock).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../../test/utils';
import userEvent from '@testing-library/user-event';
import { LoveAndRelationshipsView } from '../LoveAndRelationshipsView';
import { useMockData } from '../../../contexts/MockDataContext';
import {
  getMockRomanticRelationships,
  getMockRomanticRelationshipsByFilter,
} from '../../../mocks/romanticRelationships';
import { ROMANTIC_LORE_TEST_CASES } from '../../../mocks/romanticLoreStory';

vi.mock('../../../contexts/MockDataContext', () => ({
  useMockData: vi.fn(),
  getGlobalMockDataEnabled: () => false,
  setGlobalMockDataEnabled: vi.fn(),
  subscribeToMockDataState: vi.fn(() => vi.fn()),
  MockDataProvider: ({ children }: { children?: unknown }) => children,
}));

vi.mock('../../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

describe('Love & Relationships — lore story integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useMockData as ReturnType<typeof vi.fn>).mockReturnValue({ useMockData: true });
  });

  it('renders full connected cast from real mock data', async () => {
    render(<LoveAndRelationshipsView />);

    const cardNames = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Nova', 'Elena'];
    await waitFor(() => {
      for (const name of cardNames) {
        expect(screen.getAllByText(name).length).toBeGreaterThan(0);
      }
    });
    expect(screen.getByText(/9 relationship/i)).toBeInTheDocument();
  });

  it('shows lore story showcase with all test cases', async () => {
    render(<LoveAndRelationshipsView />);

    await waitFor(() => {
      expect(screen.getByTestId('romantic-story-showcase')).toBeInTheDocument();
    });

    for (const tc of ROMANTIC_LORE_TEST_CASES) {
      expect(screen.getByTestId(`lore-test-case-${tc.id}`)).toBeInTheDocument();
    }
  });

  it('shows lexical evidence on relationship cards', async () => {
    render(<LoveAndRelationshipsView />);

    await waitFor(() => {
      expect(screen.getByTestId('relationship-card-rel-001')).toBeInTheDocument();
    });

    const alexCard = screen.getByTestId('relationship-card-rel-001');
    expect(alexCard.textContent).toMatch(/girlfriend/i);
  });

  it('filters map to lore fixture tabs', async () => {
    const user = userEvent.setup();
    render(<LoveAndRelationshipsView />);

    await waitFor(() => expect(screen.getAllByText('Alex').length).toBeGreaterThan(0));

    const filters: Array<'no_contact' | 'reconnection' | 'high_risk'> = [
      'no_contact',
      'reconnection',
      'high_risk',
    ];

    for (const filter of filters) {
      const tabPattern =
        filter === 'no_contact'
          ? /no contact/i
          : filter === 'reconnection'
            ? /reconnect/i
            : /high risk|risk/i;
      await user.click(screen.getByRole('tab', { name: tabPattern }));
      const expected = getMockRomanticRelationshipsByFilter(filter);
      if (expected.length > 0) {
        await waitFor(() => {
          expect(screen.getAllByText(expected[0].person_name).length).toBeGreaterThan(0);
        });
      }
    }
  });

  it('lore relationships have consistent metadata', () => {
    const rels = getMockRomanticRelationships();
    expect(rels).toHaveLength(9);
    for (const rel of rels) {
      expect(rel.metadata?.lexical_evidence).toBeTruthy();
      expect(rel.metadata?.glossary_cues?.length).toBeGreaterThan(0);
      expect(rel.metadata?.signals?.signal_strength).toBeTruthy();
    }
  });

  it('suggestions show Priya and Daniel from ch.4 lore', async () => {
    render(<LoveAndRelationshipsView />);
    await waitFor(() => {
      expect(screen.getByTestId('lore-test-case-lore-priya-dating')).toBeInTheDocument();
      expect(screen.getByTestId('lore-test-case-lore-daniel-talking')).toBeInTheDocument();
    });
  });
});
