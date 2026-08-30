import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '../../test/utils';
import { MainCharacterProfileCard } from './MainCharacterProfileCard';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import type { Character } from './CharacterProfileCard';

const { mockFetchJson } = vi.hoisted(() => ({
  mockFetchJson: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: mockFetchJson,
}));

vi.mock('../../lib/runtimeIdentity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  canCallAuthenticatedApi: () => true,
}));

vi.mock('../../api/selfCharacter', () => ({
  selfCharacterApi: {
    // Reject so the component falls through to its fetchJson-based
    // attribute fallback — mirrors the pattern CharacterBook.test.tsx uses.
    getProfile: vi.fn().mockRejectedValue(new Error('no profile in test')),
    ensureSelf: vi.fn().mockResolvedValue({ success: true, character: null }),
  },
}));

vi.mock('../../store/api/entitiesApi', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useGetCharactersBookQuery: () => ({ dataUpdatedAt: 0 }),
}));

vi.mock('../../hooks/useLoreKeeper', () => ({
  useLoreKeeper: vi.fn(),
}));

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

    await waitFor(() => {
      expect(screen.getByText('A Costco Shopping Trip With Abuela')).toBeInTheDocument();
    });
    expect(screen.getByText(/Currently In/i)).toBeInTheDocument();
    expect(screen.getByText('+1 more')).toBeInTheDocument();
    expect(screen.getByText(/2 active arcs/i)).toBeInTheDocument();
    expect(screen.getByText(/since Jul 2026/i)).toBeInTheDocument();
  });

  it('renders no "Currently In" block when there are no active arcs', async () => {
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
