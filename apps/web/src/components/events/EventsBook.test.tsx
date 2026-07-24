import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '../../test/utils';
import { fetchJson } from '../../lib/api';
import { EventsBook } from './EventsBook';

const sampleEvent = {
  id: 'event-1',
  title: 'Night out with Jamie',
  summary: 'Caught up at a show and walked around afterward.',
  type: 'social',
  start_time: '2026-06-01T20:00:00.000Z',
  end_time: null,
  confidence: 0.84,
  people: ['Jamie'],
  locations: ['Downtown'],
  activities: ['show'],
  source_count: 2,
  created_at: '2026-06-02T00:00:00.000Z',
  updated_at: '2026-06-02T00:00:00.000Z',
};

const samplePattern = {
  id: 'scene-1',
  canonical_title: 'Punk Shows',
  dominant_entity_names: ['Maya', 'Jordan'],
  recurring_activities: ['music', 'dancing'],
  emotional_tone: 'positive',
  occurrence_count: 6,
  continuity_strength: 0.91,
  first_seen_at: '2025-10-01T00:00:00.000Z',
  last_seen_at: '2026-06-01T00:00:00.000Z',
  source_event_ids: ['event-4', 'event-11'],
  timeline_candidate: true,
};

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: vi.fn(() => false),
  shouldUseMockData: () => false,
}));

vi.mock('../../store/hooks/useEntityBooks', () => ({
  useEventsBookData: () => ({
    events: [sampleEvent],
    eventsSuccess: true,
    loading: false,
    authLoading: false,
    skipServer: false,
    refetch: vi.fn(),
    assembleFromChats: vi.fn(),
    isAssembling: false,
    invalidate: vi.fn(),
    dispatch: vi.fn(),
  }),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn().mockResolvedValue({ success: true, events: [] }),
}));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false, isMockDataActive: false, toggleMockData: () => {}, setUseMockData: () => {}, setIsMockDataActive: () => {} }),
  MockDataProvider: ({ children }: { children?: unknown }) => children,
}));

vi.mock('../../contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestState: null,
    startGuestSession: vi.fn(),
    endGuestSession: vi.fn(),
    incrementChatMessage: vi.fn(() => false),
    canSendChatMessage: () => true,
  }),
  GUEST_CHAT_LIMIT: 5,
  GuestProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

vi.mock('./EventDetailModal', () => ({ EventDetailModal: () => null }));
vi.mock('../memory-explorer/MemoryExplorer', () => ({
  MemoryExplorer: () => <div data-testid="memory-explorer">Memory explorer</div>,
}));

describe('EventsBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem('lorebook.eventsBook.cardViewMode');
    localStorage.removeItem('lorebook.eventsBook.patternsViewMode');
    vi.mocked(fetchJson).mockResolvedValue({ success: true, events: [] });
  });

  it('renders ChatFirstViewHint with chat-first messaging', async () => {
    const { findByText } = render(<EventsBook />);
    expect(await findByText(/This view is built from your conversations/i)).toBeInTheDocument();
  });

  it('shows a Filters toggle button in the header', async () => {
    render(<EventsBook />);
    await waitFor(() => {
      expect(screen.queryByText(/This view is built from your conversations/i)).toBeInTheDocument();
    });
    const filtersButton = screen.queryByRole('button', { name: /Filters?/i });
    expect(filtersButton).toBeInTheDocument();
  });

  it('renders the Moments tab by default with a search input', async () => {
    const { findByText } = render(<EventsBook />);
    await findByText(/This view is built from your conversations/i);
    expect(screen.getByRole('button', { name: /^Moments$/i })).toBeInTheDocument();
    const searchInput = document.querySelector('input[type="text"]');
    expect(searchInput).toBeInTheDocument();
  });

  it('keeps Moments and Patterns as the only primary tabs and interconnects story surfaces', async () => {
    render(<EventsBook />);
    await screen.findByText('Night out with Jamie');

    expect(screen.getByRole('button', { name: /^Moments$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Patterns$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Browse$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Scenes from your conversations/i)).toBeInTheDocument();
    expect(screen.queryByText(/Timeline puts them in order/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Connected story views/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Timeline/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anchors/i })).toBeInTheDocument();
  });

  it('keeps Scale chips inside Filters rather than always visible', async () => {
    render(<EventsBook />);
    await screen.findByText('Night out with Jamie');

    expect(screen.queryByText(/^Scale$/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Filters?/i }));
    expect(screen.getByText(/^Scale$/i)).toBeInTheDocument();
  });

  it('switches between grid and list views and exposes copy all', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<EventsBook />);
    expect(await screen.findByText('Night out with Jamie')).toBeInTheDocument();
    expect(screen.getByTestId('events-book-grid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy all/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /list view/i }));
    expect(screen.getByTestId('events-book-list')).toBeInTheDocument();
    expect(screen.queryByTestId('events-book-grid')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /grid view/i }));
    expect(screen.getByTestId('events-book-grid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /copy all/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(String(writeText.mock.calls[0]?.[0])).toContain('Night out with Jamie');
  });

  it('opens Search facts as a secondary Moments action and can return', async () => {
    render(<EventsBook />);
    await screen.findByText('Night out with Jamie');

    fireEvent.click(screen.getByRole('button', { name: /search facts/i }));
    expect(await screen.findByTestId('memory-explorer')).toBeInTheDocument();
    expect(screen.queryByTestId('events-book-grid')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy all/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /back to moments/i }));
    expect(await screen.findByTestId('events-book-grid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy all/i })).toBeInTheDocument();
  });

  it('supports grid, list, and copy all on Patterns', async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      success: true,
      scenes: [samplePattern],
    });

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<EventsBook />);
    fireEvent.click(screen.getByRole('button', { name: /^Patterns$/i }));

    expect(await screen.findByText('Punk Shows')).toBeInTheDocument();
    expect(screen.getByTestId('patterns-book-grid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy all/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /list view/i }));
    expect(screen.getByTestId('patterns-book-list')).toBeInTheDocument();
    expect(screen.queryByTestId('patterns-book-grid')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /grid view/i }));
    expect(screen.getByTestId('patterns-book-grid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /copy all/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(String(writeText.mock.calls[0]?.[0])).toContain('Punk Shows');
    expect(String(writeText.mock.calls[0]?.[0])).toContain('Life Log / Patterns');
  });
});
