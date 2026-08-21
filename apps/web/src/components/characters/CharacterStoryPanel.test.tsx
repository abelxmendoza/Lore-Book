import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CharacterStoryPanel, formatCharacterTimelineWhen } from './CharacterStoryPanel';
import type { MemoryCard } from '../../types/memory';
import { dispatchTemporalViewsUpdated } from '../../lib/storyRefresh';

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false }),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../../lib/storyRefresh', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storyRefresh')>();
  return actual;
});

vi.mock('../events/EventDetailModal', () => ({
  EventDetailModal: ({ event, onClose }: { event: { title: string }; onClose: () => void }) => (
    <div data-testid="event-detail-modal">
      <span>{event.title}</span>
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

import { fetchJson } from '../../lib/api';

const fetchJsonMock = vi.mocked(fetchJson);

const sampleMemory: MemoryCard = {
  id: 'mem-1',
  title: 'Journal night with Jerry',
  content: 'We talked about LoreBook on the couch.',
  date: '2024-07-01T00:00:00.000Z',
  tags: ['family'],
  source: 'journal',
  sourceIcon: 'book',
  characters: ['Jerry Medina'],
};

describe('CharacterStoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchJsonMock.mockResolvedValue({
      success: true,
      timelines: {
        sharedExperiences: [
          {
            id: 'cte-1',
            eventId: 'evt-1',
            eventTitle: 'Dinner with Jerry',
            eventDate: '2024-06-01T00:00:00.000Z',
            eventSummary: 'Shared meal',
            userWasPresent: true,
          },
        ],
        lore: [
          {
            id: 'cte-2',
            eventId: 'evt-2',
            eventTitle: 'Graduated college',
            eventDate: '2020-05-15T00:00:00.000Z',
            eventSummary: 'Finished the degree',
          },
        ],
      },
    });
  });

  it('links out to Life Log and Omni Timeline for the character', async () => {
    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="c1" characterName="Jerry Medina" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());

    const lifeLog = screen.getByTestId('character-timeline-open-life-log');
    const omni = screen.getByTestId('character-timeline-open-omni');
    expect(lifeLog.getAttribute('href')).toContain('/events?q=Jerry%20Medina');
    expect(omni.getAttribute('href')).toBe('/timeline?view=events&characterId=c1');
  });

  it('opens Life Log event detail when a timeline row is clicked', async () => {
    fetchJsonMock
      .mockResolvedValueOnce({
        success: true,
        timelines: {
          sharedExperiences: [
            {
              id: 'cte-1',
              eventId: 'evt-1',
              eventTitle: 'Dinner with Jerry',
              eventDate: '2024-06-01T00:00:00.000Z',
              eventSummary: 'Shared meal',
              userWasPresent: true,
            },
          ],
          lore: [],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        event: { id: 'evt-1', title: 'Dinner with Jerry', date: '2024-06-01' },
      });

    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="c1" characterName="Jerry Medina" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('character-timeline-event-cte-1'));
    await waitFor(() => expect(screen.getByTestId('event-detail-modal')).toBeInTheDocument());
  });

  it('merges journal memories into the story chronology and scopes by chip', async () => {
    const onSelectMemory = vi.fn();
    render(
      <MemoryRouter>
        <CharacterStoryPanel
          characterId="c1"
          characterName="Jerry Medina"
          active
          memories={[sampleMemory]}
          onSelectMemory={onSelectMemory}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    expect(screen.getByText('Journal night with Jerry')).toBeInTheDocument();
    expect(screen.getByTestId('character-story-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Memories/i }));
    expect(screen.queryByText('Dinner with Jerry')).not.toBeInTheDocument();
    expect(screen.getByText('Journal night with Jerry')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('character-story-memory-mem-1'));
    expect(onSelectMemory).toHaveBeenCalledWith(expect.objectContaining({ id: 'mem-1' }));
  });

  it('shows relationship arc stages when provided', async () => {
    render(
      <MemoryRouter>
        <CharacterStoryPanel
          characterId="c1"
          characterName="Jerry Medina"
          active
          stageHistory={[
            { stage: 'acquaintance', start_date: '2020-01-01' },
            { stage: 'close', start_date: '2024-01-01' },
          ]}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    expect(screen.getByText('Relationship arc')).toBeInTheDocument();
    expect(screen.getByText('acquaintance')).toBeInTheDocument();
    expect(screen.getByText('close')).toBeInTheDocument();
  });

  it('offers Dating arc CTA when onOpenDatingArc is provided', async () => {
    const onOpenDatingArc = vi.fn();
    render(
      <MemoryRouter>
        <CharacterStoryPanel
          characterId="c1"
          characterName="Alex"
          active
          onOpenDatingArc={onOpenDatingArc}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('open-dating-romance-overview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('open-dating-romance-overview'));
    expect(onOpenDatingArc).toHaveBeenCalledTimes(1);
  });

  it('keeps unresolved items out of the dated list', async () => {
    fetchJsonMock.mockResolvedValueOnce({
      success: true,
      timelines: {
        sharedExperiences: [],
        lore: [],
        unresolved: [
          {
            id: 'event:unresolved',
            eventId: 'evt-u',
            eventTitle: 'Something with Jamie',
            eventDate: '',
            isUnresolved: true,
            occurredStart: null,
            provenanceLabel: 'Unresolved',
          },
        ],
        summary: {},
      },
    });

    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="char-jamie" characterName="Jamie" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('character-unresolved-tray')).toBeInTheDocument());
    expect(screen.getByText('Something with Jamie')).toBeInTheDocument();
    expect(screen.getByText(/Date unresolved/)).toBeInTheDocument();
    expect(screen.queryByTestId('character-timeline-event-event:unresolved')).not.toBeInTheDocument();
  });

  it('15. temporal edit signal refetches the character timeline', async () => {
    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="char-jamie" characterName="Jamie" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(fetchJsonMock).toHaveBeenCalled());
    const before = fetchJsonMock.mock.calls.length;
    dispatchTemporalViewsUpdated();
    await waitFor(() => expect(fetchJsonMock.mock.calls.length).toBeGreaterThan(before));
  });

  it('Refresh reloads the canonical timeline and does not rebuild character_timeline_events', async () => {
    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="char-jamie" characterName="Jamie" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => {
      const rebuild = fetchJsonMock.mock.calls.some(
        (call) => String(call[0]).includes('rebuild-timelines'),
      );
      expect(rebuild).toBe(false);
    });
    expect(
      fetchJsonMock.mock.calls.every((call) =>
        String(call[0]).includes('/api/conversation/characters/char-jamie/timelines'),
      ),
    ).toBe(true);
  });

  it('does not render a leftover compatibility tray even if the API still sends one', async () => {
    fetchJsonMock.mockResolvedValueOnce({
      success: true,
      timelines: {
        sharedExperiences: [
          {
            id: 'event:evt_1',
            eventId: 'evt_1',
            eventTitle: 'Dinner with Jamie',
            eventDate: '2026-03-12T19:00:00.000Z',
            occurredStart: '2026-03-12T19:00:00.000Z',
            userWasPresent: true,
          },
        ],
        lore: [],
        unresolved: [],
        compatibilityReview: [
          {
            id: 'legacy-2',
            reason: 'legacy_unmatched',
            title: 'Old MemoVault meetup',
            eventId: 'evt-only-legacy',
          },
        ],
      },
    });

    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="char-jamie" characterName="Jamie" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jamie')).toBeInTheDocument());
    expect(screen.queryByTestId('character-compatibility-review')).not.toBeInTheDocument();
    expect(screen.queryByText('Old MemoVault meetup')).not.toBeInTheDocument();
  });
});

describe('formatCharacterTimelineWhen', () => {
  it('shows local time for exact precision and date only for day precision', () => {
    expect(
      formatCharacterTimelineWhen({
        id: 'e1',
        eventTitle: 'Exact',
        eventDate: '2026-08-20T02:30:00.000Z',
        occurredStart: '2026-08-20T02:30:00.000Z',
        precision: 'exact',
        isTimed: true,
        timezone: 'America/Los_Angeles',
      }),
    ).toMatch(/Aug 19, 2026/);

    expect(
      formatCharacterTimelineWhen({
        id: 'e2',
        eventTitle: 'Day',
        eventDate: '2026-08-10T00:00:00.000Z',
        occurredStart: '2026-08-10T00:00:00.000Z',
        precision: 'date',
        isTimed: false,
        timezone: 'UTC',
      }),
    ).toBe('Aug 10, 2026');
  });

  it('shows a start–end range and does not duplicate the id', () => {
    expect(
      formatCharacterTimelineWhen({
        id: 'event:festival',
        eventTitle: 'Festival',
        eventDate: '2026-08-21T16:00:00.000Z',
        occurredStart: '2026-08-21T16:00:00.000Z',
        occurredEnd: '2026-08-23T04:00:00.000Z',
        precision: 'date',
        isRange: true,
        timezone: 'UTC',
      }),
    ).toBe('Aug 21, 2026 – Aug 23, 2026');
  });

  it('does not fabricate a day from eventDate when occurrence is missing', () => {
    expect(
      formatCharacterTimelineWhen({
        id: 'event:legacy-shape',
        eventTitle: 'Card date',
        eventDate: '2010-01-01T00:00:00.000Z',
        occurredStart: null,
      }),
    ).toBe('Date unresolved');
  });
});
