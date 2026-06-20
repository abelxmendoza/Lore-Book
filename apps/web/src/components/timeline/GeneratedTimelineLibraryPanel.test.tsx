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
    events: [],
    isMock: true,
    arcTitles: [],
    collapsed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
];

describe('GeneratedTimelineLibraryPanel', () => {
  it('returns null when library is empty', () => {
    const { container } = render(
      <GeneratedTimelineLibraryPanel
        timelines={[]}
        onOpen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('opens a saved timeline', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(
      <GeneratedTimelineLibraryPanel
        timelines={timelines}
        onOpen={onOpen}
        onRemove={vi.fn()}
        defaultExpanded
      />,
    );

    await user.click(screen.getByText('Everything with Alex'));
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
        defaultExpanded
      />,
    );

    await user.click(screen.getByRole('button', { name: /remove everything with alex/i }));
    expect(onRemove).toHaveBeenCalledWith('t1');
  });
});
