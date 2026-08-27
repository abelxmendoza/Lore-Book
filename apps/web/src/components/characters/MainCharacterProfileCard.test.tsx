import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '../../test/utils';
import { MainCharacterProfileCard } from './MainCharacterProfileCard';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import type { Character } from './CharacterProfileCard';

const { mockCanCallAuthenticatedApi, mockFetchJson } = vi.hoisted(() => ({
  // Identity-surface tests below don't need arcs/attributes to load, so the
  // gate defaults closed; the "Currently In" tests open it explicitly.
  mockCanCallAuthenticatedApi: vi.fn(() => false),
  mockFetchJson: vi.fn(),
}));

vi.mock('../../lib/runtimeIdentity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/runtimeIdentity')>()),
  canCallAuthenticatedApi: mockCanCallAuthenticatedApi,
}));

vi.mock('../../store/api/entitiesApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../store/api/entitiesApi')>()),
  useGetCharactersBookQuery: () => ({ dataUpdatedAt: 0 }),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: mockFetchJson,
}));

vi.mock('../../api/selfCharacter', () => ({
  selfCharacterApi: {
    // Reject so the component falls through to its fetchJson-based
    // attribute fallback, matching how CharacterBook.test.tsx mocks this.
    getProfile: vi.fn().mockRejectedValue(new Error('no profile in test')),
    ensureSelf: vi.fn().mockResolvedValue({ success: true, character: null }),
  },
}));

vi.mock('../../hooks/useLoreKeeper', () => ({
  useLoreKeeper: vi.fn(() => ({ entries: [] })),
}));

const pollutedSelf: Character = {
  id: 'self-1',
  name: 'Jamie Rivera',
  first_name: 'Jamie',
  last_name: 'Rivera',
  role: 'Quality Assurance Technician — Failure Analysis & Prototypes, Vanguard Robotics',
  archetype: 'protagonist',
  importance_level: 'protagonist',
  status: 'active',
  memory_count: 12,
  alias: ['Isolation And Resilience', 'Jamie Rivera the Isolation And Resilience'],
  tags: ["DJ · mentioned in relation to the user's outing · auto-generated"],
  summary: 'Main character energy: builder of timelines and trouble — the one the assistant is legally required to remember.',
  metadata: {
    is_self: true,
    is_user: true,
    middle_name: 'Alex',
    epithet: 'Isolation And Resilience',
    witty_tagline:
      'Main character energy: builder of timelines and trouble — the one the assistant is legally required to remember.',
    context_hooks: [
      'has an interview on the horizon',
      'speaks fluent warehouse diagnostics',
      'between-arc transition era',
    ],
  },
};

describe('MainCharacterProfileCard identity surface', () => {
  it('shows the legal name instead of a chapter-title epithet', () => {
    mockCanCallAuthenticatedApi.mockReturnValue(false);
    render(<MainCharacterProfileCard character={pollutedSelf} interactive={false} />);

    const card = screen.getByTestId('main-character-card');
    expect(card).toHaveTextContent('Jamie Rivera');
    expect(card).toHaveTextContent('Quality Assurance Technician');
    expect(card).not.toHaveTextContent('the Isolation And Resilience');
    expect(card).not.toHaveTextContent('builder of timelines and trouble');
    expect(card).not.toHaveTextContent('warehouse diagnostics');
    expect(card).not.toHaveTextContent('interview on the horizon');
    expect(card).not.toHaveTextContent('Upload a resume');
    expect(card).not.toHaveTextContent('auto-generated');
  });
});

const baseCharacter: Character = {
  id: 'self-1',
  name: 'Abel Mendoza',
  role: 'Protagonist',
  archetype: 'protagonist',
  summary: 'The main character.',
  user_id: 'user-1',
  alias: [],
  pronouns: null,
  status: 'active',
  first_appearance: null,
  tags: [],
  metadata: { is_self: true, is_user: true },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as unknown as Character;

describe('MainCharacterProfileCard — "Currently In" arc content', () => {
  it('shows the active arc, "+N more", active-arc count, and since-date — content that used to live on a separate UserProfile card', async () => {
    mockCanCallAuthenticatedApi.mockReturnValue(true);
    vi.mocked(useLoreKeeper).mockReturnValue({
      entries: [
        { id: 'e1', date: '2026-07-05T00:00:00.000Z' } as never,
        { id: 'e2', date: '2026-08-01T00:00:00.000Z' } as never,
      ],
    } as never);

    mockFetchJson.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/life-arcs')) {
        return {
          arcs: [
            { id: 'arc-1', title: 'A Costco Shopping Trip With Abuela', arc_type: 'personal', track: 'relationships', confidence: 0.8, is_active: true, emotional_arc: 'building' },
            { id: 'arc-2', title: 'Second Arc', arc_type: 'personal', confidence: 0.7, is_active: true },
          ],
        };
      }
      if (url.includes('/attributes')) {
        return { attributes: [] };
      }
      return {};
    });

    render(<MainCharacterProfileCard character={baseCharacter} />);

    // "A Costco Shopping Trip" is filtered out by selectProfileLifeArcs
    // (an "occasion" title, not a durable arc) — "Second Arc" becomes primary.
    await waitFor(() => {
      expect(screen.getByText('Second Arc')).toBeInTheDocument();
    });
    expect(screen.getByText(/Currently In/i)).toBeInTheDocument();
    expect(screen.queryByText('A Costco Shopping Trip With Abuela')).not.toBeInTheDocument();
    expect(screen.getByText(/1 active arc/i)).toBeInTheDocument();
    expect(screen.getByText(/since Jul 2026/i)).toBeInTheDocument();
  });

  it('renders no "Currently In" block when there are no active arcs', async () => {
    mockCanCallAuthenticatedApi.mockReturnValue(true);
    vi.mocked(useLoreKeeper).mockReturnValue({ entries: [] } as never);
    mockFetchJson.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/life-arcs')) return { arcs: [] };
      if (url.includes('/attributes')) return { attributes: [] };
      return {};
    });

    render(<MainCharacterProfileCard character={baseCharacter} />);

    await waitFor(() => {
      expect(mockFetchJson).toHaveBeenCalledWith(expect.stringContaining('/api/life-arcs'));
    });
    expect(screen.queryByText(/Currently In/i)).not.toBeInTheDocument();
  });
});
