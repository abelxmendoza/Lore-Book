import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineCalendarView } from './TimelineCalendarView';
import type { CalendarMonthResult } from '../../api/calendarMonth';

const { reloadMock, openMemoryMock, fetchJsonMock } = vi.hoisted(() => ({
  reloadMock: vi.fn(async () => undefined),
  openMemoryMock: vi.fn(),
  fetchJsonMock: vi.fn(),
}));

vi.mock('../../hooks/useCalendarMonth', () => ({
  useCalendarMonth: vi.fn(),
}));

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('../../contexts/EntityModalContext', () => ({
  useEntityModal: () => ({ openMemory: openMemoryMock }),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: fetchJsonMock,
}));

vi.mock('./TimelineStitchedView', () => ({
  TimelineStitchedView: ({ lifeArcId }: { lifeArcId?: string }) => (
    <div data-testid="stitched-overlay">{lifeArcId}</div>
  ),
}));

vi.mock('../events/EventDetailModal', () => ({
  EventDetailModal: ({ event }: { event: { title: string } }) => (
    <div data-testid="event-detail-modal">{event.title}</div>
  ),
}));

import { useCalendarMonth } from '../../hooks/useCalendarMonth';

const useCalendarMonthMock = vi.mocked(useCalendarMonth);

const FIXED_DATE = '2026-07-15';

function monthResult(overrides?: Partial<CalendarMonthResult>): CalendarMonthResult {
  return {
    year: 2026,
    month: 7,
    days: [
      {
        date: FIXED_DATE,
        occasions: [
          {
            id: 'occ-1',
            title: 'Team dinner',
            summary: 'Dinner after the demo',
            userPresence: 'attended',
            itemCount: 2,
          },
        ],
        items: [
          {
            id: 'occasion:occ-1',
            kind: 'occasion',
            title: 'Team dinner',
            sortTime: `${FIXED_DATE}T18:00:00.000Z`,
            userPresence: 'attended',
            lifeArcId: 'occ-1',
          },
          {
            id: 'moment-1',
            kind: 'moment',
            title: 'Late notes',
            sortTime: `${FIXED_DATE}T22:15:00.000Z`,
            userPresence: 'attended',
            sourceKind: 'journal_entry',
            sourceId: 'journal-1',
            body: 'Wrote down what happened.',
          },
          {
            id: 'event:evt-1',
            kind: 'event',
            title: 'Vanguard Robotics demo',
            sortTime: `${FIXED_DATE}T16:00:00.000Z`,
            userPresence: 'attended',
            sourceKind: 'resolved_event',
            sourceId: 'evt-1',
            body: 'Marcus presented MemoVault.',
          },
        ],
        attendedCount: 2,
        heardAboutCount: 0,
        concurrentOccasions: 1,
      },
    ],
    ...overrides,
  };
}

describe('TimelineCalendarView', () => {
  beforeEach(() => {
    reloadMock.mockClear();
    openMemoryMock.mockClear();
    fetchJsonMock.mockReset();
    fetchJsonMock.mockResolvedValue({
      event: { id: 'evt-1', title: 'Vanguard Robotics demo' },
    });
    const data = monthResult();
    useCalendarMonthMock.mockReturnValue({
      data,
      dayMap: new Map(data.days.map((d) => [d.date, d])),
      loading: false,
      error: null,
      reload: reloadMock,
      isDemoMode: false,
    });
  });

  it('renders the month grid and selected day details', async () => {
    render(<TimelineCalendarView initialDate={FIXED_DATE} />);
    expect(screen.getByTestId('timeline-calendar-view')).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: /calendar/i })).toBeInTheDocument();
    const detail = screen.getByTestId('calendar-day-detail');
    await waitFor(() => {
      expect(detail).toHaveTextContent('Team dinner');
    });
    expect(detail).toHaveTextContent('Late notes');
    expect(detail).toHaveTextContent(/3 items/i);
  });

  it('surfaces load errors with retry', async () => {
    const user = userEvent.setup();
    useCalendarMonthMock.mockReturnValue({
      data: null,
      dayMap: new Map(),
      loading: false,
      error: 'Network down',
      reload: reloadMock,
      isDemoMode: false,
    });
    render(<TimelineCalendarView />);
    expect(screen.getByTestId('calendar-error')).toHaveTextContent('Network down');
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(reloadMock).toHaveBeenCalled();
  });

  it('navigates months and keeps selection inside the visible month', async () => {
    const user = userEvent.setup();
    const onDateChange = vi.fn();
    render(<TimelineCalendarView onDateChange={onDateChange} />);
    await user.click(screen.getByRole('button', { name: /next month/i }));
    expect(onDateChange).toHaveBeenCalled();
    const last = onDateChange.mock.calls.at(-1)?.[0] as string;
    expect(last).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('opens chronology for the selected day', async () => {
    const user = userEvent.setup();
    const onOpenDayInTimeline = vi.fn();
    render(
      <TimelineCalendarView
        initialDate={FIXED_DATE}
        onOpenDayInTimeline={onOpenDayInTimeline}
      />,
    );
    await user.click(screen.getByRole('button', { name: /open in chronology/i }));
    expect(onOpenDayInTimeline).toHaveBeenCalledWith(FIXED_DATE);
  });

  it('honors initialDate deep links', () => {
    render(<TimelineCalendarView initialDate="2024-06-15" />);
    expect(screen.getByText(/June 2024/i)).toBeInTheDocument();
  });

  it('shows fuzzy historical periods as parallel tracks instead of day cards', () => {
    const data = monthResult({
      historicalNeighborhoods: [{
        id: 'year:2026', label: '2026',
        start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.999Z',
        precision: 'year', relationIds: ['relation-1'],
        tracks: [
          { id: 'martial_arts', label: 'Martial arts', itemIds: ['tillis'] },
          { id: 'relationships', label: 'Relationships', itemIds: ['kiley'] },
        ],
      }],
    });
    useCalendarMonthMock.mockReturnValue({
      data,
      dayMap: new Map(data.days.map((day) => [day.date, day])),
      loading: false,
      error: null,
      reload: reloadMock,
      isDemoMode: false,
    });
    render(<TimelineCalendarView initialDate={FIXED_DATE} />);
    const neighborhood = screen.getByTestId('calendar-historical-neighborhood');
    expect(neighborhood).toHaveTextContent('overlapping chapters');
    expect(neighborhood).toHaveTextContent('Martial arts');
    expect(neighborhood).toHaveTextContent('Relationships');
  });

  it('opens a journal-backed moment as memory detail, not resolved-event detail', async () => {
    const user = userEvent.setup();
    render(<TimelineCalendarView initialDate={FIXED_DATE} />);
    await user.click(screen.getByText('Late notes'));
    expect(openMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'journal-1', journal_entry_id: 'journal-1' }),
    );
    expect(fetchJsonMock).not.toHaveBeenCalledWith('/api/conversation/events/journal-1');
  });

  it('opens a resolved event by source id', async () => {
    const user = userEvent.setup();
    render(<TimelineCalendarView initialDate={FIXED_DATE} />);
    await user.click(screen.getByText('Vanguard Robotics demo'));
    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith('/api/conversation/events/evt-1');
    });
    expect(await screen.findByTestId('event-detail-modal')).toHaveTextContent('Vanguard Robotics demo');
  });

  it('opens an occasion as the life-arc container', async () => {
    const user = userEvent.setup();
    render(<TimelineCalendarView initialDate={FIXED_DATE} />);
    const detail = screen.getByTestId('calendar-day-detail');
    await user.click(within(detail).getByText('Team dinner'));
    expect(await screen.findByTestId('stitched-overlay')).toHaveTextContent('occ-1');
    expect(fetchJsonMock).not.toHaveBeenCalledWith('/api/conversation/events/occ-1');
  });
});
