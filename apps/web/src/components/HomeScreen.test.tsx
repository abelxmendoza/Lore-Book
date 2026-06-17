import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// ── Mock heavy dependencies before component import ──────────────────────────

vi.mock('../lib/supabase', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'user-123', email: 'test@example.com' }, loading: false })),
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
  isSupabaseConfigured: () => true,
  getConfigDebug: () => ({}),
}));

vi.mock('../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../api/whatChanged', () => ({
  fetchWhatChanged: vi.fn().mockResolvedValue({ summary: { hasChanges: false }, lines: [] }),
}));

vi.mock('../api/skills', () => ({
  skillsApi: {
    getSkills: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../hooks/useQuests', () => ({
  useQuestBoard: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
}));

// Stub LivingBiographyCard to avoid its own fetch complexity
vi.mock('./biography/LivingBiographyCard', () => ({
  LivingBiographyCard: () => <div data-testid="living-biography-card">Biography Card</div>,
}));

vi.mock('../contexts/ChatThreadContext', () => ({
  useRecentChatThreads: vi.fn(() => []),
}));

import { HomeScreen } from './HomeScreen';

function wrap(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('HomeScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders without crashing', async () => {
    const { fetchJson } = await import('../lib/api');
    vi.mocked(fetchJson).mockResolvedValue({ characters: [] });

    const { container } = wrap(<HomeScreen />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('shows a time-appropriate greeting', async () => {
    const { fetchJson } = await import('../lib/api');
    vi.mocked(fetchJson).mockResolvedValue({ characters: [] });

    wrap(<HomeScreen />);
    await waitFor(() => {
      const greeting = screen.queryByText(/Good (morning|afternoon|evening)/i);
      expect(greeting).toBeInTheDocument();
    });
  });

  it('renders the LivingBiographyCard section', async () => {
    const { fetchJson } = await import('../lib/api');
    vi.mocked(fetchJson).mockResolvedValue({ characters: [] });

    wrap(<HomeScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('living-biography-card')).toBeInTheDocument();
    });
  });

  it('renders the characters section heading when characters load', async () => {
    const { fetchJson } = await import('../lib/api');
    vi.mocked(fetchJson).mockResolvedValue({
      characters: [
        { id: 'c1', name: 'Sarah Chen', importance_score: 90, avatar_url: null },
        { id: 'c2', name: 'Marcus', importance_score: 75, avatar_url: null },
      ],
    });

    wrap(<HomeScreen />);
    await waitFor(() => {
      // Section heading for key people
      expect(screen.getByText(/Sarah Chen/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders quests section heading', async () => {
    const { fetchJson } = await import('../lib/api');
    vi.mocked(fetchJson).mockResolvedValue({ characters: [] });

    const { useQuestBoard } = await import('../hooks/useQuests');
    vi.mocked(useQuestBoard).mockReturnValue({
      data: {
        main_quests: [{ id: 'q1', title: 'Launch MVP', status: 'active' }],
        side_quests: [],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    wrap(<HomeScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Launch MVP/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('renders skills section when skills are present', async () => {
    const { fetchJson } = await import('../lib/api');
    const { skillsApi } = await import('../api/skills');
    vi.mocked(fetchJson).mockResolvedValue({ characters: [] });
    vi.mocked(skillsApi.getSkills).mockResolvedValue([
      { id: 's1', skill_name: 'Product Design', skill_level: 4, skill_category: 'professional' } as any,
    ]);

    wrap(<HomeScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Product Design/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('handles character fetch error gracefully', async () => {
    const { fetchJson } = await import('../lib/api');
    vi.mocked(fetchJson).mockRejectedValue(new Error('network error'));

    const { container } = wrap(<HomeScreen />);
    await waitFor(() => {
      // Should still render the page without crashing
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });
});
