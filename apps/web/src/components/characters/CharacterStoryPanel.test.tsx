import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CharacterStoryPanel } from './CharacterStoryPanel';
import type { MemoryCard } from '../../types/memory';

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false }),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
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
});
