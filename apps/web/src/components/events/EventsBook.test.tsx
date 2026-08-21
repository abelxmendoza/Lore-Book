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

  it('does not show the legacy chat-first banner above Life Log', async () => {
    render(<EventsBook />);
    await screen.findByTestId('life-story-job');
    expect(screen.queryByText(/This view is built from your conversations/i)).not.toBeInTheDocument();
  });

  it('shows a Filters toggle button in the header', async () => {
    render(<EventsBook />);
    await screen.findByTestId('life-story-job');
    const filtersButton = screen.queryByRole('button', { name: /Filters?/i });
    expect(filtersButton).toBeInTheDocument();
  });

  it('renders the Moments tab by default with a search input', async () => {
    render(<EventsBook />);
    await screen.findByRole('button', { name: /^Moments$/i });
    expect(screen.getByRole('button', { name: /^Moments$/i })).toBeInTheDocument();
    const searchInput = document.querySelector('input[type="text"]');
    expect(searchInput).toBeInTheDocument();
  });

  it('keeps Moments and Patterns as the only primary tabs and explains the other views', async () => {
    render(<EventsBook />);
    await screen.findByText('Night out with Jamie');

    expect(screen.getByRole('button', { name: /^Moments$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Patterns$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Browse$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Search facts$/i })).toBeInTheDocument();
    expect(screen.getByText(/Browse every moment/i)).toBeInTheDocument();
    expect(screen.getByTestId('life-story-job')).toHaveTextContent(/Chronology puts the same moments in time/i);
    expect(screen.getByLabelText(/How to look at your life/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Timeline/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anchors/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Life Saga/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Post a moment/i })).toBeInTheDocument();
    expect(screen.getByText(/1 moment/i)).toBeInTheDocument();
  });

  it('restores Life Log celebration classifiers with nested subcategories', async () => {
    render(<EventsBook />);
    await screen.findByText('Night out with Jamie');

    expect(screen.getByRole('tablist', { name: /Moment categories/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Birthdays/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Weddings/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Parties/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Concerts|Shows/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Conventions/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Parties/i }));
    expect(screen.getByTestId('events-book-subcategory-tabs')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Baby Showers/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Raves/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Concerts|Shows/i }));
    expect(screen.getByRole('tab', { name: /Backyard Shows/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Fight Night/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Local Scene/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Work/i }));
    expect(screen.getByRole('tab', { name: /Meetings/i })).toBeInTheDocument();
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
    expect(screen.getByText(/Atomic details from your moments/i)).toBeInTheDocument();
    expect(screen.queryByTestId('events-book-grid')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy all/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /back to moments/i }));
    expect(await screen.findByTestId('events-book-grid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy all/i })).toBeInTheDocument();
  });

  it('supports grid and list on Patterns, with Copy all', async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      success: true,
      scenes: [samplePattern],
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
    expect(screen.getByRole('button', { name: /copy all/i })).toBeInTheDocument();
  });

  it('copies pattern data to the clipboard from Patterns', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /copy all/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain('Timeline / Patterns');
    expect(copied).toContain('Punk Shows');
  });

  it('hides Life Log chrome when embedded as a Timeline tab', async () => {
    render(<EventsBook embedded mode="events" />);
    await screen.findByText('Night out with Jamie');
    expect(screen.queryByText('Life Log')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/How to look at your life/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Patterns$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Post a moment/i })).toBeInTheDocument();
  });
});
