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
  return {
    kind: overrides.sourceKind === 'journal_entry' ? 'moment' : 'event',
    sourceIds: [overrides.sourceId],
    sourceType: overrides.sourceKind,
    sortTime: '2024-06-01T00:00:00.000Z',
    userSortIndex: null,
    body: '',
    ...overrides,
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
});
