import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CharacterTimelinePanel } from './CharacterTimelinePanel';

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

describe('CharacterTimelinePanel', () => {
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
        <CharacterTimelinePanel characterId="c1" characterName="Jerry Medina" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());

    const lifeLog = screen.getByTestId('character-timeline-open-life-log');
    const omni = screen.getByTestId('character-timeline-open-omni');
    expect(lifeLog.getAttribute('href')).toContain('/timeline?view=moments&q=Jerry%20Medina');
    // Real character-scoped deep link (filters by character_id server-side) —
    // not the old free-text "?q=" search, which could fall back to mock data.
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
        <CharacterTimelinePanel characterId="c1" characterName="Jerry Medina" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('character-timeline-event-cte-1'));

    await waitFor(() => expect(screen.getByTestId('event-detail-modal')).toBeInTheDocument());
    expect(fetchJsonMock).toHaveBeenCalledWith('/api/conversation/events/evt-1');
  });

  it('opens a local event detail modal when a demo timeline moment is clicked', async () => {
    render(
      <MemoryRouter>
        <CharacterTimelinePanel
          characterId="demo-jordan"
          characterName="Jordan"
          mockMode
          active
        />
      </MemoryRouter>,
    );

    const moment = await screen.findByText('Shared hangout #2');
    fireEvent.click(moment.closest('button')!);

    expect(await screen.findByTestId('event-detail-modal')).toHaveTextContent('Shared hangout #2');
    expect(fetchJsonMock).not.toHaveBeenCalled();
  });

  it('opens the same event detail modal from a demo swimlane marker', async () => {
    render(
      <MemoryRouter>
        <CharacterTimelinePanel
          characterId="demo-alex"
          characterName="Alex"
          mockMode
          active
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Swimlanes/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Shared hangout #2/i }));

    expect(await screen.findByTestId('event-detail-modal')).toHaveTextContent('Shared hangout #2');
    expect(fetchJsonMock).not.toHaveBeenCalled();
  });

  it('filters the timeline by search term', async () => {
    render(
      <MemoryRouter>
        <CharacterTimelinePanel characterId="c1" characterName="Jerry Medina" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    expect(screen.getByText('Graduated college')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/search jerry's story/i), {
      target: { value: 'dinner' },
    });

    expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument();
    expect(screen.queryByText('Graduated college')).not.toBeInTheDocument();
  });

  it('shows a no-results message when the search matches nothing', async () => {
    render(
      <MemoryRouter>
        <CharacterTimelinePanel characterId="c1" characterName="Jerry Medina" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/search jerry's story/i), {
      target: { value: 'nonexistent event' },
    });

    expect(screen.getByText(/no events match/i)).toBeInTheDocument();
    expect(screen.queryByText('Dinner with Jerry')).not.toBeInTheDocument();
  });

  it('copies the whole timeline as text, respecting the active search filter', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <MemoryRouter>
        <CharacterTimelinePanel characterId="c1" characterName="Jerry Medina" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /copy all timeline events/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copiedText = writeText.mock.calls[0][0] as string;
    expect(copiedText).toContain(`Jerry Medina's Timeline`);
    expect(copiedText).toContain('Dinner with Jerry');
    expect(copiedText).toContain('Graduated college');

    await waitFor(() => expect(screen.getByRole('button', { name: /copy all timeline events/i })).toHaveTextContent('Copied'));
  });

  it('always exposes Compile LoreBook forms control on the character timeline', async () => {
    render(
      <MemoryRouter>
        <CharacterTimelinePanel characterId="c1" characterName="Jerry Medina" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Dinner with Jerry')).toBeInTheDocument());
    expect(screen.getByTestId('character-timeline-create-lorebook')).toBeInTheDocument();
    expect(screen.getByTestId('character-timeline-create-lorebook-menu')).toBeInTheDocument();
  });

  it('opens LoreBook forms picker from the character timeline control', async () => {
    render(
      <MemoryRouter>
        <CharacterTimelinePanel characterId="c1" characterName="Jerry Medina" active />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByTestId('character-timeline-create-lorebook-menu')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('character-timeline-create-lorebook-menu').querySelector('button')!);
    expect(await screen.findByText(/Compile a LoreBook/i)).toBeInTheDocument();
    expect(screen.getByText(/LoreBook forms/i)).toBeInTheDocument();
    expect(screen.getByText(/^Vignette$/i)).toBeInTheDocument();
  });
});
