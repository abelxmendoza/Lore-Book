import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '../../test/utils';
import { EventsBook } from './EventsBook';

vi.mock('../../hooks/useLoreKeeper', () => ({
  useLoreKeeper: () => ({ entries: [], chapters: [] }),
}));

vi.mock('../../hooks/useShouldUseMockData', () => ({
  shouldUseMockData: () => false,
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn().mockResolvedValue({ success: true, events: [] }),
}));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false, isMockDataActive: false, toggleMockData: () => {}, setUseMockData: () => {}, setIsMockDataActive: () => {} }),
  MockDataProvider: ({ children }: { children?: unknown }) => children,
}));

vi.mock('../timeline/ColorCodedTimeline', () => ({
  ColorCodedTimeline: () => null,
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

  it('does not show a Filters toggle button in the header', async () => {
    render(<EventsBook />);
    await waitFor(() => {
      expect(screen.queryByText(/This view is built from your conversations/i)).toBeInTheDocument();
    });
    const filtersButton = screen.queryByRole('button', { name: /Filters?/i });
    expect(filtersButton).not.toBeInTheDocument();
  });

  it('renders event grid with grid-cols-2 on mobile', async () => {
    const { container, findByText } = render(<EventsBook />);
    await findByText(/This view is built from your conversations/i);
    const grid = container.querySelector('.grid-cols-2');
    expect(grid).toBeInTheDocument();
  });
});
