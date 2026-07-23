import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '../../test/utils';
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
});
