import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../test/utils';
import { TimelineCardView } from './TimelineCardView';
import type { TimelineResponse } from '../../hooks/useLoreKeeper';

const mockTimeline: TimelineResponse = {
  chapters: [
    {
      id: 'chapter-1',
      title: 'Test Chapter',
      start_date: '2024-01-01',
      end_date: null,
      months: [
        {
          month: 'January 2024',
          entries: [
            {
              id: 'entry-1',
              date: '2024-01-15',
              content: 'Test entry content',
              summary: 'Test summary',
              tags: ['test', 'example'],
              mood: 'happy',
            },
          ],
        },
      ],
    },
  ],
  unassigned: [],
};

describe('TimelineCardView', () => {
  it('renders entries in detailed mode', () => {
    const handleClick = vi.fn();
    render(
      <TimelineCardView
        timeline={mockTimeline}
        density="detailed"
        onEntryClick={handleClick}
      />
    );

    expect(screen.getByText('Test entry content')).toBeInTheDocument();
    expect(screen.getByText('Test summary')).toBeInTheDocument();
  });

  it('renders chapter headers in chapters mode', () => {
    render(
      <TimelineCardView
        timeline={mockTimeline}
        density="chapters"
        onEntryClick={vi.fn()}
      />
    );

    expect(screen.getByText('Test Chapter')).toBeInTheDocument();
    expect(screen.getByText(/1 entries/)).toBeInTheDocument();
  });

  it('calls onEntryClick when entry card is clicked', () => {
    const handleClick = vi.fn();
    render(
      <TimelineCardView
        timeline={mockTimeline}
        density="detailed"
        onEntryClick={handleClick}
      />
    );

    const card = screen.getByText('Test entry content').closest('[role="button"], button, div');
    if (card) {
      card.click();
      expect(handleClick).toHaveBeenCalledWith('entry-1');
    }
  });

  it('shows empty state when no entries', () => {
    const emptyTimeline: TimelineResponse = {
      chapters: [],
      unassigned: [],
    };

    render(
      <TimelineCardView
        timeline={emptyTimeline}
        density="detailed"
        onEntryClick={vi.fn()}
      />
    );

    expect(screen.getByText(/no timeline entries/i)).toBeInTheDocument();
  });

  it('displays tags correctly', () => {
    render(
      <TimelineCardView
        timeline={mockTimeline}
        density="detailed"
        onEntryClick={vi.fn()}
      />
    );

    expect(screen.getByText('test')).toBeInTheDocument();
    expect(screen.getByText('example')).toBeInTheDocument();
  });

  it('displays mood badge when present', () => {
    render(
      <TimelineCardView
        timeline={mockTimeline}
        density="detailed"
        onEntryClick={vi.fn()}
      />
    );

    expect(screen.getByText('happy')).toBeInTheDocument();
  });
});

