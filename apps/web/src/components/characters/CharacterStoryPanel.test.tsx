import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CharacterStoryPanel } from './CharacterStoryPanel';
import type { MemoryCard } from '../../types/memory';
import type { StitchedTimelineItem, StitchedTimelineResult } from '../../api/stitchedTimeline';

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

vi.mock('../../lib/storyRefresh', () => ({
  onStoryDataUpdated: () => () => {},
}));

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

function stitchedItem(
  overrides: Partial<StitchedTimelineItem> & Pick<StitchedTimelineItem, 'id' | 'sourceId' | 'sourceKind' | 'title'>,
): StitchedTimelineItem {
  const sortTime = overrides.sortTime ?? '2024-06-01T00:00:00.000Z';
  const occurrenceStatus = overrides.occurrenceStatus ?? 'confirmed';
  return {
    kind: overrides.sourceKind === 'journal_entry' ? 'moment' : 'event',
    sourceIds: [overrides.sourceId],
    sourceType: overrides.sourceKind,
    userSortIndex: null,
    body: '',
    ...overrides,
    sortTime,
    occurrenceStatus,
    temporal: overrides.temporal ?? {
      occurred: {
        start: occurrenceStatus === 'unresolved' ? null : sortTime,
        end: null,
        precision: 'day',
        source: 'user_stated',
        status: occurrenceStatus,
        confidence: 0.9,
        expression: null,
        timezone: null,
      },
      mentionedAt: null,
      recordedAt: null,
      knownFrom: null,
      validFrom: null,
      validUntil: null,
      provenance: [],
    },
  };
}

function stitchedResult(items: StitchedTimelineItem[]): StitchedTimelineResult {
  return {
    scope_type: 'global',
    scope_id: '00000000-0000-0000-0000-000000000000',
    scope_label: null,
    items,
    has_user_order: false,
  };
}

const defaultItems: StitchedTimelineItem[] = [
  stitchedItem({
    id: 'event:evt-1',
    sourceId: 'evt-1',
    sourceKind: 'resolved_event',
    title: 'Dinner with Jerry',
    body: 'Shared meal',
    userPresence: 'attended',
  }),
  stitchedItem({
    id: 'event:evt-2',
    sourceId: 'evt-2',
    sourceKind: 'resolved_event',
    title: 'Graduated college',
    body: 'Finished the degree',
    sortTime: '2020-05-15T00:00:00.000Z',
    userPresence: 'heard_about',
  }),
];

describe('CharacterStoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stitchedGet.mockResolvedValue(stitchedResult(defaultItems));
    fetchJsonMock.mockResolvedValue({
      success: true,
      event: { id: 'evt-1', title: 'Dinner with Jerry', date: '2024-06-01' },
    });
  });

  it('loads character-scoped stitched chronology instead of character_timeline_events', async () => {
    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="c1" characterName="Jerry Medina" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    expect(stitchedGet).toHaveBeenCalledWith(
      expect.objectContaining({ scope_type: 'global', character_id: 'c1' }),
    );
    expect(
      fetchJsonMock.mock.calls.some(([url]) =>
        String(url).includes('/api/conversation/characters/c1/timelines'),
      ),
    ).toBe(false);
    expect(screen.getByText('Graduated college')).toBeInTheDocument();
    expect(screen.getAllByText('With you').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Without you').length).toBeGreaterThan(0);
  });

  it('renders an empty stitched result without falling back to legacy character timeline rows', async () => {
    stitchedGet.mockResolvedValue(stitchedResult([]));
    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="c1" characterName="Marcus" active />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No story for Marcus yet')).toBeInTheDocument();
    expect(screen.queryByText('Dinner with Jerry')).not.toBeInTheDocument();
    expect(
      fetchJsonMock.mock.calls.some(([url]) => String(url).includes('/api/conversation/characters/')),
    ).toBe(false);
  });

  it('links out to Moments and Timeline for the character', async () => {
    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="c1" characterName="Jerry Medina" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());

    const lifeLog = screen.getByTestId('character-timeline-open-life-log');
    const omni = screen.getByTestId('character-timeline-open-omni');
    expect(lifeLog.getAttribute('href')).toContain('/timeline?view=moments&q=Jerry%20Medina');
    expect(omni.getAttribute('href')).toBe('/timeline?view=events&characterId=c1');
    expect(lifeLog.getAttribute('href')).not.toContain('/events?q=');
    expect(lifeLog).toHaveTextContent('Moments');
    expect(omni).toHaveTextContent('Timeline');
  });

  it('opens resolved-event detail by sourceId, not the stitched composite id', async () => {
    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="c1" characterName="Jerry Medina" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('character-timeline-event-event:evt-1'));
    await waitFor(() => expect(screen.getByTestId('event-detail-modal')).toBeInTheDocument());
    expect(fetchJsonMock).toHaveBeenCalledWith('/api/conversation/events/evt-1');
    expect(
      fetchJsonMock.mock.calls.some(([url]) => String(url) === '/api/conversation/events/event:evt-1'),
    ).toBe(false);
  });

  it('does not fetch conversation-events when a journal-shaped stitched item is clicked', async () => {
    const onSelectMemory = vi.fn();
    stitchedGet.mockResolvedValue(
      stitchedResult([
        stitchedItem({
          id: 'moment:journal-1',
          sourceId: 'journal-1',
          sourceKind: 'journal_entry',
          title: 'Walk home from HQ',
          body: 'Wrote it down after the MemoVault demo.',
          userPresence: 'attended',
        }),
      ]),
    );

    render(
      <MemoryRouter>
        <CharacterStoryPanel
          characterId="char-marcus"
          characterName="Marcus"
          active
          onSelectMemory={onSelectMemory}
        />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId('character-timeline-event-moment:journal-1'));
    await waitFor(() => {
      expect(onSelectMemory).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'journal-1', title: 'Walk home from HQ' }),
      );
    });
    expect(
      fetchJsonMock.mock.calls.some(([url]) => String(url).includes('/api/conversation/events/')),
    ).toBe(false);
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

  it('rescans by reloading stitched chronology instead of rebuilding character_timeline_events', async () => {
    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="char-marcus" characterName="Marcus" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(stitchedGet).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /rescan/i }));
    await waitFor(() => expect(stitchedGet).toHaveBeenCalledTimes(2));
    expect(
      fetchJsonMock.mock.calls.some(([url]) => String(url).includes('rebuild-timelines')),
    ).toBe(false);
  });

  it('orders memories by occurrence and keeps recording time as metadata', async () => {
    render(
      <MemoryRouter>
        <CharacterStoryPanel
          characterId="c1"
          characterName="Jamie"
          active
          memories={[
            {
              id: 'mem-late-write',
              title: 'Concert with Jamie',
              content: 'Last month we went to a concert.',
              date: '2026-07-15T20:00:00.000Z',
              occurredAt: '2026-07-15T20:00:00.000Z',
              recordedAt: '2026-08-20T18:42:13.001Z',
              mentionedAt: '2026-08-20T18:42:13.001Z',
              occurrenceStatus: 'confirmed',
              tags: [],
              source: 'chat',
              sourceIcon: 'chat',
              characters: ['Jamie'],
            },
            {
              id: 'mem-unresolved',
              title: 'Something I forgot when',
              content: 'I do not remember when this was.',
              date: '',
              occurredAt: null,
              recordedAt: '2026-08-20T18:42:13.001Z',
              occurrenceStatus: 'unresolved',
              tags: [],
              source: 'chat',
              sourceIcon: 'chat',
              characters: ['Jamie'],
            },
          ]}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Concert with Jamie')).toBeInTheDocument());
    const items = screen.getAllByTestId(/character-story-memory-|character-timeline-event-/);
    const labels = items.map((el) => el.textContent ?? '');
    const concertIdx = labels.findIndex((text) => text.includes('Concert with Jamie'));
    const unresolvedIdx = labels.findIndex((text) => text.includes('Something I forgot when'));
    expect(concertIdx).toBeGreaterThanOrEqual(0);
    expect(unresolvedIdx).toBeGreaterThan(concertIdx);
    expect(screen.getByText('Date unknown')).toBeInTheDocument();
    expect(screen.getAllByText(/Recorded/).length).toBeGreaterThan(0);
  });

  it('does not render a journal memory as a second event when it shares a canonical event id', async () => {
    render(
      <MemoryRouter>
        <CharacterStoryPanel
          characterId="c1"
          characterName="Jamie"
          active
          memories={[
            {
              id: 'mem-dup',
              title: 'Dinner writeup',
              content: 'Wrote about dinner later.',
              date: '2024-06-01T00:00:00.000Z',
              occurredAt: '2024-06-01T00:00:00.000Z',
              canonicalEventId: 'evt-1',
              occurrenceStatus: 'confirmed',
              tags: [],
              source: 'journal',
              sourceIcon: 'book',
              characters: ['Jamie'],
            },
          ]}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    expect(screen.queryByText('Dinner writeup')).not.toBeInTheDocument();
  });

  it('keeps canonical sourceKind and sourceId on the rendered event row', async () => {
    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="c1" characterName="Jerry Medina" active />
      </MemoryRouter>,
    );

    const row = await screen.findByTestId('character-timeline-event-event:evt-1');
    expect(row).toHaveAttribute('data-canonical-item-id', 'event:evt-1');
    expect(row).toHaveAttribute('data-source-kind', 'resolved_event');
    expect(row).toHaveAttribute('data-source-id', 'evt-1');
  });

  it('shows Date unknown for unresolved stitched events and does not promote recordedAt', async () => {
    stitchedGet.mockResolvedValue(
      stitchedResult([
        stitchedItem({
          id: 'event:evt-unknown',
          sourceId: 'evt-unknown',
          sourceKind: 'resolved_event',
          title: 'Something I forgot when',
          userPresence: 'attended',
          occurrenceStatus: 'unresolved',
          sortTime: '2026-08-20T18:42:13.001Z',
          temporal: {
            occurred: {
              start: null,
              end: null,
              precision: 'unknown',
              source: 'recording_fallback',
              status: 'unresolved',
              confidence: 0,
              expression: null,
              timezone: null,
            },
            mentionedAt: '2026-08-20T18:42:13.001Z',
            recordedAt: '2026-08-20T18:42:13.001Z',
            knownFrom: '2026-08-20T18:42:13.001Z',
            validFrom: null,
            validUntil: null,
            provenance: [],
          },
        }),
      ]),
    );

    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="c1" characterName="Jamie" active />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Something I forgot when')).toBeInTheDocument();
    expect(screen.getByText('Date unknown')).toBeInTheDocument();
    expect(screen.getByText(/Recorded Aug 20, 2026/)).toBeInTheDocument();
  });

  it('preserves a known occurrence date from CanonicalTemporalModel', async () => {
    stitchedGet.mockResolvedValue(
      stitchedResult([
        stitchedItem({
          id: 'event:evt-known',
          sourceId: 'evt-known',
          sourceKind: 'resolved_event',
          title: 'Northwind Hall outing',
          userPresence: 'attended',
          sortTime: '2026-08-21T00:00:00.000Z',
          temporal: {
            occurred: {
              start: '2026-07-15T20:00:00.000Z',
              end: null,
              precision: 'day',
              source: 'user_stated',
              status: 'confirmed',
              confidence: 0.95,
              expression: null,
              timezone: null,
            },
            mentionedAt: '2026-08-21T00:00:00.000Z',
            recordedAt: '2026-08-21T00:00:00.000Z',
            knownFrom: '2026-08-21T00:00:00.000Z',
            validFrom: null,
            validUntil: null,
            provenance: [],
          },
        }),
      ]),
    );

    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="c1" characterName="Maya" active />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Northwind Hall outing')).toBeInTheDocument();
    expect(screen.getByText('Jul 15, 2026')).toBeInTheDocument();
  });

  it('shows loading then recovers for a character with no events', async () => {
    let resolveGet: ((value: StitchedTimelineResult) => void) | undefined;
    stitchedGet.mockReturnValue(
      new Promise<StitchedTimelineResult>((resolve) => {
        resolveGet = resolve;
      }),
    );

    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="c-empty" characterName="Priya" active />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('entity-timeline-loading')).toBeInTheDocument();
    resolveGet?.(stitchedResult([]));
    expect(await screen.findByText('No story for Priya yet')).toBeInTheDocument();
  });

  it('surfaces a chronology load error without crashing', async () => {
    stitchedGet.mockRejectedValue(new Error('stitched down'));
    render(
      <MemoryRouter>
        <CharacterStoryPanel characterId="c1" characterName="Marcus" active />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('character-story-error')).toBeInTheDocument();
    expect(screen.getByText(/No story for Marcus yet/)).toBeInTheDocument();
  });
});
