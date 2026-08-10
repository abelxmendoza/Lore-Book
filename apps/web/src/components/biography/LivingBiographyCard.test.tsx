import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LivingBiographyCard } from './LivingBiographyCard';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockFetchCard = vi.fn();
vi.mock('../../hooks/useLoreReadiness', () => ({
  useLoreReadiness: () => ({
    compiledBooks: [{ id: 'demo-1', title: 'The Builder Years', created_at: '2025-01-01', chapterCount: 6 }],
    loading: false,
  }),
}));

vi.mock('../../api/livingBiography', () => ({
  fetchLivingBiographyCard: (...args: unknown[]) => mockFetchCard(...args),
}));

vi.mock('../../lib/cache', () => ({
  apiCache: {
    deletePattern: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    getInflight: vi.fn(),
  },
}));

const FULL_CARD = {
  name: 'Alex',
  currentChapter: { label: 'The Creative Sprint', evidence: [] },
  topThemes: ['music', 'growth', 'travel'],
  keyPeople: [
    { name: 'Jamie Chen', relationship: 'friend', status: 'active' },
    { name: 'Marcus', relationship: 'colleague', status: 'active' },
  ],
  currentFocus: ['shipping the product'],
  recentDevelopments: [],
  lastUpdated: new Date(Date.now() - 86_400_000).toISOString(), // yesterday
  hasEnoughData: true,
};

function wrap(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe('LivingBiographyCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a loading skeleton while fetching', () => {
    mockFetchCard.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = wrap(<LivingBiographyCard />);
    expect(container.querySelector('[aria-hidden]')).toBeTruthy();
  });

  it('renders nothing when card is null', async () => {
    mockFetchCard.mockResolvedValue({ card: null });
    const { container } = wrap(<LivingBiographyCard />);
    await waitFor(() => {
      expect(container.querySelector('[aria-hidden]')).toBeNull();
      expect(container.firstChild).toBeNull();
    });
  });

  it('renders nothing when hasEnoughData is false', async () => {
    mockFetchCard.mockResolvedValue({ card: { ...FULL_CARD, hasEnoughData: false } });
    const { container } = wrap(<LivingBiographyCard />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('renders the current chapter label when data is present', async () => {
    mockFetchCard.mockResolvedValue({ card: FULL_CARD });
    wrap(<LivingBiographyCard />);
    await waitFor(() => {
      expect(screen.getByText('The Creative Sprint')).toBeInTheDocument();
    });
  });

  it('renders top themes as chips', async () => {
    mockFetchCard.mockResolvedValue({ card: FULL_CARD });
    wrap(<LivingBiographyCard />);
    await waitFor(() => {
      expect(screen.getByText('music')).toBeInTheDocument();
      expect(screen.getByText('growth')).toBeInTheDocument();
      expect(screen.getByText('travel')).toBeInTheDocument();
    });
  });

  it('renders Identity Snapshot threads, goals, and evidence coverage when available', async () => {
    mockFetchCard.mockResolvedValue({
      card: FULL_CARD,
      identitySnapshot: {
        id: 'identity-demo',
        generatedAt: '2026-08-08T00:00:00.000Z',
        algorithmVersion: 'identity-snapshot-v1',
        stale: false,
        confidence: 0.88,
        currentChapter: {
          title: 'Engineering Rebuild and Creative Launch',
          summary: 'Building while creating.',
          confidence: 0.9,
        },
        threads: [
          {
            id: 'thread-career',
            domain: 'career',
            name: 'Technical and Career Work',
            summary: 'A durable technical through-line.',
            salience: 'dominant',
            stability: 'stable',
            momentum: 'growing',
            trajectory: 'transforming',
            strength: 91,
            confidence: 0.9,
            lastReinforced: '2026-08-07',
          },
        ],
        coverage: [
          {
            domain: 'career',
            score: 86,
            band: 'strong',
            evidenceCount: 8,
            sourceDiversity: 3,
            lastReinforced: '2026-08-07',
          },
        ],
        goals: [{ id: 'goal-1', title: 'Ship MemoVault beta', status: 'active' }],
        recentChanges: [],
        tensions: [],
      },
    });
    wrap(<LivingBiographyCard />);

    await waitFor(() => {
      expect(screen.getByText('Engineering Rebuild and Creative Launch')).toBeInTheDocument();
      expect(screen.getByText('Technical and Career Work')).toBeInTheDocument();
      expect(screen.getByText('growing · 91%')).toBeInTheDocument();
      expect(screen.getByText('Ship MemoVault beta')).toBeInTheDocument();
      expect(screen.getByText(/Identity evidence coverage.*86%/)).toBeInTheDocument();
    });
  });

  it('renders key people as clickable buttons', async () => {
    mockFetchCard.mockResolvedValue({ card: FULL_CARD });
    wrap(<LivingBiographyCard />);
    await waitFor(() => {
      expect(screen.getByText('Jamie Chen')).toBeInTheDocument();
      expect(screen.getByText('Marcus')).toBeInTheDocument();
    });
  });

  it('clicking a person name navigates to /lorebook?focus=...', async () => {
    mockFetchCard.mockResolvedValue({ card: FULL_CARD });
    wrap(<LivingBiographyCard />);
    await waitFor(() => screen.getByText('Jamie Chen'));

    fireEvent.click(screen.getByText('Jamie Chen'));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('/lorebook?focus=')
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('Jamie%20Chen')
    );
  });

  it('clicking the card itself navigates to the compiled lorebook editor', async () => {
    mockFetchCard.mockResolvedValue({ card: FULL_CARD });
    wrap(<LivingBiographyCard />);
    await waitFor(() => screen.getByText('The Creative Sprint'));

    const card = screen.getByRole('button', { name: /Your Story Right Now/i });
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith('/memoir?book=demo-1');
  });

  it('shows last-updated timestamp', async () => {
    mockFetchCard.mockResolvedValue({ card: FULL_CARD });
    wrap(<LivingBiographyCard />);
    await waitFor(() => {
      expect(screen.getByText(/Updated yesterday/i)).toBeInTheDocument();
    });
  });

  it('shows current focus when present', async () => {
    mockFetchCard.mockResolvedValue({ card: FULL_CARD });
    wrap(<LivingBiographyCard />);
    await waitFor(() => {
      expect(screen.getByText('shipping the product')).toBeInTheDocument();
    });
  });

  it('shows recent developments when focus is empty', async () => {
    const card = { ...FULL_CARD, currentFocus: [], recentDevelopments: ['launched v2', 'hit 100 users'] };
    mockFetchCard.mockResolvedValue({ card });
    wrap(<LivingBiographyCard />);
    await waitFor(() => {
      expect(screen.getByText('launched v2')).toBeInTheDocument();
      expect(screen.getByText('hit 100 users')).toBeInTheDocument();
    });
  });

  it('handles fetch error gracefully — renders nothing', async () => {
    mockFetchCard.mockRejectedValue(new Error('network error'));
    const { container } = wrap(<LivingBiographyCard />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
