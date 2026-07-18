import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  TimelineReorderableList,
  buildTimelineClipboardText,
} from './TimelineReorderableList';
import type { StitchedTimelineItem } from '../../api/stitchedTimeline';

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

const ITEMS: StitchedTimelineItem[] = [
  {
    id: 'i1',
    kind: 'moment',
    sourceId: 's1',
    sortTime: '2024-03-01T12:00:00Z',
    userSortIndex: null,
    title: 'First practice session',
    body: 'Worked on the new set list',
    sourceKind: 'journal_entry',
    sourceIds: ['s1'],
    sourceType: 'manual',
  },
  {
    id: 'i2',
    kind: 'event',
    sourceId: 's2',
    sortTime: '2024-04-12T20:00:00Z',
    userSortIndex: null,
    title: 'The big show',
    body: 'The big show',
    sourceKind: 'resolved_event',
    sourceIds: ['s2'],
    sourceType: 'resolved_event',
  },
];

function renderList(overrides: Partial<Parameters<typeof TimelineReorderableList>[0]> = {}) {
  const props = {
    items: ITEMS,
    onSelect: vi.fn(),
    onReorder: vi.fn(),
    onSaveOrder: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<TimelineReorderableList {...props} />);
  return props;
}

describe('buildTimelineClipboardText', () => {
  it('formats one line per item with date, kind, and title', () => {
    const text = buildTimelineClipboardText(ITEMS);
    expect(text).toBe(
      '2024-03-01 · Moment · First practice session\n' +
        '  Worked on the new set list\n' +
        '2024-04-12 · Event · The big show',
    );
  });

  it('omits the body when it duplicates the title', () => {
    const text = buildTimelineClipboardText([ITEMS[1]]);
    expect(text).not.toContain('\n');
  });

  it('includes cohesion score and merged duplicate titles when present', () => {
    const text = buildTimelineClipboardText([
      {
        ...ITEMS[1],
        cohesion: 93,
        mergedCount: 3,
        mergedTitles: ['Show prep', 'Sound check at the venue'],
      },
    ]);
    expect(text).toContain('[cohesion 93]');
    expect(text).toContain('(merged duplicates: Show prep · Sound check at the venue)');
  });
});

describe('TimelineReorderableList', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('locks reordering by default: no move buttons, cards not draggable', () => {
    renderList();
    expect(screen.queryByLabelText('Move up')).toBeNull();
    expect(document.querySelector('[draggable="true"]')).toBeNull();
  });

  it('shows reorder controls only after toggling Reorder, and hides them on Done', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /reorder/i }));
    expect(screen.getAllByLabelText('Move up')).toHaveLength(2);
    expect(document.querySelector('[draggable="true"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(screen.queryByLabelText('Move up')).toBeNull();
  });

  it('reorders via arrow buttons while unlocked', () => {
    const props = renderList();
    fireEvent.click(screen.getByRole('button', { name: /reorder/i }));
    fireEvent.click(screen.getAllByLabelText('Move down')[0]);
    expect(props.onReorder).toHaveBeenCalledWith([ITEMS[1], ITEMS[0]]);
  });

  it('copies all items as plain text and shows feedback', async () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /copy all/i }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        buildTimelineClipboardText(ITEMS),
      );
      expect(screen.getByText('Copied')).toBeTruthy();
    });
  });

  it('opens an item on click', () => {
    const props = renderList();
    fireEvent.click(screen.getByText('First practice session'));
    expect(props.onSelect).toHaveBeenCalledWith(ITEMS[0]);
  });

  it('does not open an item when the click ends a text selection', () => {
    const props = renderList();
    const getSelection = vi
      .spyOn(window, 'getSelection')
      .mockReturnValue({ toString: () => 'First practice' } as Selection);
    fireEvent.click(screen.getByText('First practice session'));
    expect(props.onSelect).not.toHaveBeenCalled();
    getSelection.mockRestore();
  });
});
