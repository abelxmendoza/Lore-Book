import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false }),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

const stitchedGet = vi.fn();
vi.mock('../../api/stitchedTimeline', () => ({
  stitchedTimelineApi: {
    get: (...args: unknown[]) => stitchedGet(...args),
  },
}));

vi.mock('../memory-explorer/MemoryCard', () => ({ MemoryCardComponent: () => null }));
vi.mock('../memory-explorer/MemoryDetailModal', () => ({
  MemoryDetailModal: ({ memory }: { memory: { title: string } }) => (
    <div data-testid="memory-detail-modal">{memory.title}</div>
  ),
}));
vi.mock('../events/EventDetailModal', () => ({
  EventDetailModal: ({ event }: { event: { title: string } }) => (
    <div data-testid="event-detail-modal">{event.title}</div>
  ),
}));
vi.mock('../../features/chat/composer/ChatComposer', () => ({ ChatComposer: () => null }));
vi.mock('../../features/chat/message/ChatMessage', () => ({ ChatMessage: () => null }));

import { fetchJson } from '../../lib/api';
import { LocationDetailModal } from './LocationDetailModal';

const fetchJsonMock = vi.mocked(fetchJson);

describe('LocationDetailModal — canonical stitched timeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchJsonMock.mockResolvedValue({ event: { id: 'evt-vanguard', title: 'Vanguard Robotics demo' } });
    stitchedGet.mockResolvedValue({
      scope_type: 'global',
      scope_id: '00000000-0000-0000-0000-000000000000',
      scope_label: null,
      items: [
        {
          id: 'event:evt-vanguard',
          kind: 'event',
          sourceId: 'evt-vanguard',
          sourceIds: ['evt-vanguard'],
          sourceKind: 'resolved_event',
          sourceType: 'resolved_event',
          sortTime: '2026-06-01T12:00:00.000Z',
          userSortIndex: null,
          title: 'Vanguard Robotics demo',
          body: 'Marcus presented MemoVault.',
          peopleIds: ['char-marcus'],
          locationIds: ['loc-novara-hq'],
        },
        {
          id: 'moment:journal-1',
          kind: 'moment',
          sourceId: 'journal-1',
          sourceIds: ['journal-1'],
          sourceKind: 'journal_entry',
          sourceType: 'journal',
          sortTime: '2026-06-01T18:00:00.000Z',
          userSortIndex: null,
          title: 'Walk home from HQ',
          body: 'Wrote it down after the demo.',
        },
      ],
      has_user_order: false,
    });
  });

  it('loads the stitched entity timeline instead of /api/locations/:id/timelines', async () => {
    render(
      <MemoryRouter>
        <LocationDetailModal
          location={{
            id: 'loc-novara-hq',
            name: 'Novara HQ',
            visitCount: 2,
            relatedPeople: [],
            tagCounts: [],
            chapters: [],
            moods: [],
            entries: [],
            sources: [],
          } as any}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /timeline/i })[0]!);

    await waitFor(() => {
      expect(stitchedGet).toHaveBeenCalledWith(
        expect.objectContaining({ scope_type: 'global', location_id: 'loc-novara-hq' }),
      );
    });
    expect(fetchJsonMock.mock.calls.some(([url]) => String(url).includes('/api/locations/loc-novara-hq/timelines'))).toBe(
      false,
    );
    expect(await screen.findByText('Vanguard Robotics demo')).toBeInTheDocument();
    expect(screen.getByTestId('location-canonical-timeline')).toBeInTheDocument();
  });

  it('opens resolved-event detail by source id and journal detail without the events API', async () => {
    render(
      <MemoryRouter>
        <LocationDetailModal
          location={{
            id: 'loc-novara-hq',
            name: 'Novara HQ',
            visitCount: 2,
            relatedPeople: [],
            tagCounts: [],
            chapters: [],
            moods: [],
            entries: [],
            sources: [],
          } as any}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /timeline/i })[0]!);
    const eventRow = await screen.findByText('Vanguard Robotics demo');
    fireEvent.click(eventRow.closest('button')!);

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith('/api/conversation/events/evt-vanguard');
    });
    expect(await screen.findByTestId('event-detail-modal')).toHaveTextContent('Vanguard Robotics demo');

    fireEvent.click(screen.getByText('Walk home from HQ').closest('button')!);
    await waitFor(() => {
      expect(screen.getByTestId('memory-detail-modal')).toHaveTextContent('Walk home from HQ');
    });
    expect(
      fetchJsonMock.mock.calls.some(([url]) => String(url) === '/api/conversation/events/journal-1'),
    ).toBe(false);
  });
});
