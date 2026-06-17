import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '../../test/utils';
import { EventsBook } from './EventsBook';

vi.mock('../../hooks/useLoreKeeper', () => ({
  useLoreKeeper: () => ({ entries: [], chapters: [] }),
}));

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: vi.fn(() => false),
  shouldUseMockData: () => false,
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn().mockResolvedValue({ success: true, events: [] }),
}));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false, isMockDataActive: false, toggleMockData: () => {}, setUseMockData: () => {}, setIsMockDataActive: () => {} }),
  MockDataProvider: ({ children }: { children?: unknown }) => children,
}));

vi.mock('./EventDetailModal', () => ({ EventDetailModal: () => null }));
vi.mock('../memory-explorer/MemoryDetailModal', () => ({ MemoryDetailModal: () => null }));

describe('EventsBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(screen.getByRole('button', { name: /Moments/i })).toBeInTheDocument();
    const searchInput = document.querySelector('input[type="text"]');
    expect(searchInput).toBeInTheDocument();
  });
});
