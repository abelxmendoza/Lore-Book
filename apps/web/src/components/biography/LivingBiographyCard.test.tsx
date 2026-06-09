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
vi.mock('../../api/livingBiography', () => ({
  fetchLivingBiographyCard: (...args: unknown[]) => mockFetchCard(...args),
}));

const FULL_CARD = {
  name: 'Abel',
  currentChapter: { label: 'The Creative Sprint', evidence: [] },
  topThemes: ['music', 'growth', 'travel'],
  keyPeople: [
    { name: 'Sarah Chen', relationship: 'friend', status: 'active' },
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

  it('renders nothing while loading', () => {
    mockFetchCard.mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = wrap(<LivingBiographyCard />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when card is null', async () => {
    mockFetchCard.mockResolvedValue({ card: null });
    const { container } = wrap(<LivingBiographyCard />);
    await waitFor(() => {
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

  it('renders top themes', async () => {
    mockFetchCard.mockResolvedValue({ card: FULL_CARD });
    wrap(<LivingBiographyCard />);
    await waitFor(() => {
      expect(screen.getByText('music, growth, travel')).toBeInTheDocument();
    });
  });

  it('renders key people as clickable buttons', async () => {
    mockFetchCard.mockResolvedValue({ card: FULL_CARD });
    wrap(<LivingBiographyCard />);
    // Use getByText — outer div[role=button] also contains "Sarah Chen" in its
    // computed accessible name, so getByRole('button') would match two elements.
    await waitFor(() => {
      expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
      expect(screen.getByText('Marcus')).toBeInTheDocument();
    });
  });

  it('clicking a person name navigates to /lorebook?focus=...', async () => {
    mockFetchCard.mockResolvedValue({ card: FULL_CARD });
    wrap(<LivingBiographyCard />);
    await waitFor(() => screen.getByText('Sarah Chen'));

    fireEvent.click(screen.getByText('Sarah Chen'));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('/lorebook?focus=')
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('Sarah%20Chen')
    );
  });

  it('clicking the card itself navigates to /memoir', async () => {
    mockFetchCard.mockResolvedValue({ card: FULL_CARD });
    wrap(<LivingBiographyCard />);
    // Wait for card to appear
    await waitFor(() => screen.getByText('The Creative Sprint'));

    // The outer div[role=button] is the card
    const card = screen.getByRole('button', { name: /Your Story Right Now/i });
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith('/memoir');
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
      expect(screen.getByText('launched v2 · hit 100 users')).toBeInTheDocument();
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
