import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: () => false,
}));

const openMemory = vi.fn();
vi.mock('../../contexts/EntityModalContext', () => ({
  useEntityModal: () => ({ openMemory }),
}));

vi.mock('../../hooks/useLifeArc', () => ({
  useLifeArc: () => ({
    data: {
      timeframe: 'LAST_30_DAYS',
      is_silence: false,
      stability_state: 'SIGNAL_PRESENT',
      narrative_summary: { text: 'A period of building.', event_ids: ['evt-1'], confidence: 0.8 },
      event_groups: {
        significant_events: [
          {
            id: 'evt-1',
            canonicalItemId: 'event:evt-1',
            sourceId: 'evt-1',
            sourceKind: 'resolved_event',
            title: 'Vanguard Robotics demo',
            summary: 'Marcus presented MemoVault.',
            start_time: '2026-06-01T12:00:00.000Z',
            end_time: null,
            confidence: 0.9,
            people: [],
            locations: [],
            activities: [],
            type: 'event',
          },
          {
            id: 'journal-1',
            canonicalItemId: 'moment:journal-1',
            sourceId: 'journal-1',
            sourceKind: 'journal_entry',
            title: 'Walk home from HQ',
            summary: 'Wrote it down after the demo.',
            start_time: '2026-06-01T18:00:00.000Z',
            end_time: null,
            confidence: 0.8,
            people: [],
            locations: [],
            activities: [],
            type: 'journal_entry',
          },
        ],
        recurring_patterns: [],
        new_entities: [],
        unresolved_events: [],
      },
      change_signals: {
        first_time_people: [],
        first_time_locations: [],
        pattern_shifts: [],
        emotional_shifts: [],
      },
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../events/EventDetailModal', () => ({
  EventDetailModal: ({ event }: { event: { title: string } }) => (
    <div data-testid="event-detail-modal">{event.title}</div>
  ),
}));

import { fetchJson } from '../../lib/api';
import { LifeArcPanel } from './LifeArcPanel';

const fetchJsonMock = vi.mocked(fetchJson);

describe('LifeArcPanel detail identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openMemory.mockReset();
    fetchJsonMock.mockResolvedValue({
      success: true,
      event: { id: 'evt-1', title: 'Vanguard Robotics demo' },
    });
  });

  it('opens resolved event detail by source id', async () => {
    render(
      <MemoryRouter>
        <LifeArcPanel />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Vanguard Robotics demo'));
    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith('/api/conversation/events/evt-1');
    });
    expect(await screen.findByTestId('event-detail-modal')).toHaveTextContent('Vanguard Robotics demo');
  });

  it('does not 404 by treating a journal id as a resolved_event id', async () => {
    render(
      <MemoryRouter>
        <LifeArcPanel />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Walk home from HQ'));
    await waitFor(() => expect(openMemory).toHaveBeenCalled());
    expect(openMemory).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'journal-1', journal_entry_id: 'journal-1' }),
    );
    expect(fetchJsonMock).not.toHaveBeenCalledWith('/api/conversation/events/journal-1');
    expect(screen.queryByTestId('event-detail-modal')).not.toBeInTheDocument();
  });
});
