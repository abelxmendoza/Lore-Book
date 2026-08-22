import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false }),
}));
vi.mock('../memory-explorer/MemoryCard', () => ({ MemoryCardComponent: () => null }));
vi.mock('../memory-explorer/MemoryDetailModal', () => ({ MemoryDetailModal: () => null }));
vi.mock('../../features/chat/composer/ChatComposer', () => ({ ChatComposer: () => null }));
vi.mock('../../features/chat/message/ChatMessage', () => ({ ChatMessage: () => null }));
vi.mock('../../lib/hydrateBookEntity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/hydrateBookEntity')>();
  return {
    ...actual,
    fetchLocationById: vi.fn(),
  };
});
vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../../lib/api';
import { fetchLocationById } from '../../lib/hydrateBookEntity';
import { LocationDetailModal } from './LocationDetailModal';

const fetchJsonMock = vi.mocked(fetchJson);

const location = {
  id: 'loc-northwind',
  name: 'Northwind Depot',
  visitCount: 4,
  firstVisited: '1999-01-01T00:00:00.000Z',
  lastVisited: '1999-12-31T00:00:00.000Z',
  relatedPeople: [],
  tagCounts: [],
  chapters: [],
  moods: [],
  entries: [],
  sources: [],
};

describe('LocationDetailModal — timeline authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchLocationById).mockResolvedValue(location as any);
    fetchJsonMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/timelines')) {
        return {
          success: true,
          timelines: {
            sharedExperiences: [
              {
                id: 'event:depot-show',
                eventTitle: 'Show at Northwind Depot',
                eventDate: '2026-08-10T18:00:00.000Z',
                eventSummary: 'Live show',
                occurredStart: '2026-08-10T18:00:00.000Z',
                canonicalItemId: 'event:depot-show',
                isUnresolved: false,
              },
            ],
            lore: [],
            unresolved: [
              { id: 'event:undated', eventTitle: 'Heard about the depot', isUnresolved: true },
            ],
            compatibilityReview: [
              { id: 'legacy-1', title: 'Invented first visit' },
            ],
          },
        };
      }
      return { success: true };
    });
  });

  it('loads GET timelines and never auto-rebuilds', async () => {
    render(<LocationDetailModal location={location as any} onClose={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: /timeline/i })[0]!);

    await waitFor(() => {
      expect(screen.getByText('Show at Northwind Depot')).toBeInTheDocument();
    });
    expect(screen.getByText('Date unresolved (1)')).toBeInTheDocument();
    expect(screen.getByText('Heard about the depot')).toBeInTheDocument();
    expect(screen.getByText('Invented first visit')).toBeInTheDocument();
    expect(screen.queryByText('Invented first visit')).toBeInTheDocument();

    const urls = fetchJsonMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/api/locations/loc-northwind/timelines'))).toBe(true);
    expect(urls.some((url) => url.includes('rebuild-timelines'))).toBe(false);
    expect(screen.getByText(/Legacy record — date not verified/i)).toBeInTheDocument();
  });

  it('does not manufacture visits from firstVisited when chronology is empty', async () => {
    fetchJsonMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/timelines')) {
        return {
          success: true,
          timelines: {
            sharedExperiences: [],
            lore: [],
            unresolved: [],
            compatibilityReview: [],
          },
        };
      }
      return { success: true };
    });

    render(<LocationDetailModal location={location as any} onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /timeline/i })[0]!);

    await waitFor(() => {
      expect(screen.getByText(/No timeline moments yet/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/First recorded visit/i)).not.toBeInTheDocument();
  });
});
