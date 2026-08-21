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

  it('labels a memory whose date is a low-confidence write-time fallback as "Recorded", not a bare date implying occurrence', async () => {
    const unreliableMemory: MemoryCard = {
      ...sampleMemory,
      id: 'mem-unreliable',
      title: 'Vague memory with no real date evidence',
      dateConfidence: 0.1,
    };
    render(
      <MemoryRouter>
        <CharacterStoryPanel
          characterId="c1"
          characterName="Jerry Medina"
          active
          memories={[unreliableMemory]}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    expect(screen.getByTestId('character-story-memory-mem-unreliable')).toBeInTheDocument();
    expect(screen.getByText(/^Recorded /)).toBeInTheDocument();
  });

  it('does not label a confidently-dated memory as "Recorded" — a real occurrence date renders plainly', async () => {
    const confidentMemory: MemoryCard = {
      ...sampleMemory,
      id: 'mem-confident',
      dateConfidence: 0.95,
    };
    render(
      <MemoryRouter>
        <CharacterStoryPanel
          characterId="c1"
          characterName="Jerry Medina"
          active
          memories={[confidentMemory]}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    expect(screen.getByTestId('character-story-memory-mem-confident')).toBeInTheDocument();
    expect(screen.queryByText(/^Recorded /)).not.toBeInTheDocument();
  });

  function storyItemOrder(container: HTMLElement): string[] {
    return Array.from(
      container.querySelectorAll('[data-testid^="character-story-memory-"], [data-testid^="character-timeline-event-"]'),
    ).map((el) => el.getAttribute('data-testid') ?? '');
  }

  it('a recording-only memory does not sort between two dated events merely because it was recorded that day — it sinks to the end', async () => {
    // Default mock provides two dated, canonical events: "Graduated college"
    // (2020-05-15) and "Dinner with Jerry" (2024-06-01). This memory's own
    // `date` (2022-01-01) falls chronologically between them, but its
    // dateConfidence marks it as a write-time fallback with no real
    // occurrence evidence — it must NOT slot in at 2022.
    const recordingOnlyMemory: MemoryCard = {
      ...sampleMemory,
      id: 'mem-recording-only',
      title: 'Vague note with no real date evidence',
      date: '2022-01-01T00:00:00.000Z',
      dateConfidence: 0.1,
    };
    const { container } = render(
      <MemoryRouter>
        <CharacterStoryPanel
          characterId="c1"
          characterName="Jerry Medina"
          active
          memories={[recordingOnlyMemory]}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    const order = storyItemOrder(container);
    expect(order).toEqual([
      'character-timeline-event-cte-2', // Graduated college, 2020
      'character-timeline-event-cte-1', // Dinner with Jerry, 2024
      'character-story-memory-mem-recording-only', // sunk to the end, not 2022's position
    ]);
  });

  it('a confidently-dated memory DOES sort into its real chronological position among events', async () => {
    const confidentMemory: MemoryCard = {
      ...sampleMemory,
      id: 'mem-mid-2022',
      date: '2022-01-01T00:00:00.000Z',
      dateConfidence: 0.95,
    };
    const { container } = render(
      <MemoryRouter>
        <CharacterStoryPanel
          characterId="c1"
          characterName="Jerry Medina"
          active
          memories={[confidentMemory]}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    const order = storyItemOrder(container);
    expect(order).toEqual([
      'character-timeline-event-cte-2', // 2020
      'character-story-memory-mem-mid-2022', // 2022 — correctly interleaved
      'character-timeline-event-cte-1', // 2024
    ]);
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
});
