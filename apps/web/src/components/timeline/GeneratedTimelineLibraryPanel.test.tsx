import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeneratedTimelineLibraryPanel } from './GeneratedTimelineLibraryPanel';
import type { SavedGeneratedTimeline } from '../../lib/generatedTimelinesLibrary';

const timelines: SavedGeneratedTimeline[] = [
  {
    id: 't1',
    query: 'Everything with Alex',
    queryKey: 'everything with alex',
    events: [
      {
        id: 'e1',
        start_time: '2024-01-10T00:00:00.000Z',
        content: 'Coffee and catch-up downtown.',
      },
      {
        id: 'e2',
        start_time: '2024-06-02T00:00:00.000Z',
        content: 'Road trip weekend.',
      },
    ],
    isMock: false,
    arcTitles: ['Friendship arc'],
    collapsed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
];

describe('GeneratedTimelineLibraryPanel', () => {
  it('returns null when strip library is empty', () => {
    const { container } = render(
      <GeneratedTimelineLibraryPanel
        timelines={[]}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows empty state on the Library page variant', () => {
    render(
      <GeneratedTimelineLibraryPanel
        timelines={[]}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        variant="page"
        onGenerateNew={vi.fn()}
      />,
    );
    expect(screen.getByTestId('generated-timeline-library-empty')).toBeInTheDocument();
    expect(screen.getByText(/No generated timelines yet/i)).toBeInTheDocument();
  });

  it('opens a saved timeline from the card action', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(
      <GeneratedTimelineLibraryPanel
        timelines={timelines}
        onOpen={onOpen}
        onRemove={vi.fn()}
        variant="page"
      />,
    );

    expect(screen.getByText('Timelines Library')).toBeInTheDocument();
    await user.click(screen.getByTestId('generated-timeline-open-t1'));
    expect(onOpen).toHaveBeenCalledWith(timelines[0]);
  });

  it('removes a saved timeline', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <GeneratedTimelineLibraryPanel
        timelines={timelines}
        onOpen={vi.fn()}
        onRemove={onRemove}
        variant="page"
      />,
    );

    await user.click(screen.getByRole('button', { name: /remove everything with alex/i }));
    expect(onRemove).toHaveBeenCalledWith('t1');
  });

  it('offers LoreBook when readiness says it can create', async () => {
    const user = userEvent.setup();
    const onCreateLorebook = vi.fn();

    render(
      <GeneratedTimelineLibraryPanel
        timelines={timelines}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        onCreateLorebook={onCreateLorebook}
        canCreateLorebook={() => ({
          canCreate: true,
          reason: 'Enough moments to compile a LoreBook.',
        })}
        variant="page"
      />,
    );

    const loreBtn = screen.getByTestId('generated-timeline-lorebook-t1');
    expect(loreBtn).toBeEnabled();
    await user.click(loreBtn);
    expect(onCreateLorebook).toHaveBeenCalledWith(timelines[0]);
  });

  it('disables LoreBook when not ready', () => {
    render(
      <GeneratedTimelineLibraryPanel
        timelines={timelines}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
        onCreateLorebook={vi.fn()}
        canCreateLorebook={() => ({
          canCreate: false,
          reason: 'Need more moments about this subject.',
        })}
        variant="page"
      />,
    );

    expect(screen.getByTestId('generated-timeline-lorebook-t1')).toBeDisabled();
  });
});
