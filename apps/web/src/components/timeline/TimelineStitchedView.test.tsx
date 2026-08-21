import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ backendUnavailable: false }),
}));

vi.mock('../../contexts/EntityModalContext', () => ({
  useEntityModal: () => ({ openMemory: vi.fn() }),
}));

const openStitchedTimelineChat = vi.fn();
vi.mock('../../lib/stitchedTimelineChat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/stitchedTimelineChat')>();
  return {
    ...actual,
    openStitchedTimelineChat: (...args: unknown[]) => openStitchedTimelineChat(...args),
  };
});

vi.mock('../../hooks/useStitchedTimeline', () => ({
  useStitchedTimeline: () => ({
    data: {
      scope_type: 'life_arc',
      scope_id: 'arc-1',
      scope_label: 'Agency Years',
      items: [],
      has_user_order: false,
      chapter: {
        title: 'Building OrbitPad with Grandma Nell',
        thesis: 'This chapter tells the story of building OrbitPad while spending the day with Grandma Nell.',
        dominantTheme: 'Building with family',
        startDate: '2026-06-03',
        endDate: '2026-06-03',
        participants: ['grandma-nell'],
        locations: ['grandma-home'],
        supportingEventIds: ['build-event'],
        backgroundEventIds: [],
        backgroundContext: ['Recently graduated and looking for work.'],
        outcomes: ['OrbitPad development progressed.'],
        contributionScores: { 'build-event': 100 },
        quality: { overallStoryQuality: 91 },
        confidence: 0.91,
      },
    },
    items: [
      {
        id: 'i1',
        kind: 'event',
        sourceId: 'build-event',
        sortTime: '2026-06-03T12:00:00Z',
        userSortIndex: null,
        title: 'Building OrbitPad',
        body: 'Spent the afternoon building OrbitPad with Grandma Nell at her kitchen table.',
        sourceKind: 'resolved_event',
        sourceIds: ['build-event'],
        sourceType: 'event',
      },
      {
        id: 'i2',
        kind: 'moment',
        sourceId: 'm1',
        sortTime: '2026-06-03T18:00:00Z',
        userSortIndex: null,
        title: 'Evening walk',
        body: 'We walked around the block and talked about shipping.',
        sourceKind: 'journal_entry',
        sourceIds: ['m1'],
        sourceType: 'journal',
      },
    ],
    loading: false,
    saving: false,
    error: null,
    reorderItems: vi.fn(),
    persistOrder: vi.fn(),
  }),
}));

vi.mock('./TimelineReorderableList', () => ({
  TimelineReorderableList: () => <div data-testid="timeline-reorderable-list" />,
}));

import { TimelineStitchedView } from './TimelineStitchedView';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  openStitchedTimelineChat.mockReset();
});

describe('TimelineStitchedView overlay', () => {
  it('renders at the document level, locks background scrolling, and closes with Escape', async () => {
    const onClose = vi.fn();
    const { container, unmount } = render(
      <TimelineStitchedView lifeArcId="arc-1" scopeLabel="Agency Years" onClose={onClose} />,
    );

    const overlay = screen.getByTestId('timeline-stitched-overlay');
    expect(overlay.parentElement).toBe(document.body);
    expect(container).toBeEmptyDOMElement();
    expect(screen.getByRole('dialog', { name: /Agency Years stitched timeline/i })).toBeVisible();
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('presents the thesis, scenes, background, outcome, and quality as chapter structure', () => {
    render(<TimelineStitchedView lifeArcId="arc-1" scopeLabel="Agency Years" embedded />);

    expect(screen.getByText('Chapter thesis')).toBeVisible();
    expect(screen.getByText(/building OrbitPad while spending the day/i)).toBeVisible();
    expect(screen.getByText('Supporting scenes')).toBeVisible();
    expect(screen.getByText('June 2026')).toBeVisible();
    expect(screen.getByText('Background during this chapter')).toBeVisible();
    expect(screen.getByText('Recently graduated and looking for work.')).toBeVisible();
    expect(screen.getByText('What changed')).toBeVisible();
    expect(screen.getByText('OrbitPad development progressed.')).toBeVisible();
    expect(screen.getByText('91')).toBeVisible();
  });

  it('labels the global chronology view in time-order language, not a feed', () => {
    render(
      <MemoryRouter>
        <TimelineStitchedView embedded />
      </MemoryRouter>,
    );

    expect(screen.getByText('Chronology')).toBeVisible();
    expect(screen.getByText('What happened, in time')).toBeVisible();
    expect(screen.getByText(/this is the date list/i)).toBeVisible();
    expect(screen.getByTestId('read-in-life-saga')).toBeInTheDocument();
  });

  it('shows compiler meter and hands off to main chat with chapter context', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <TimelineStitchedView
        lifeArcId="arc-1"
        scopeLabel="Agency Years"
        onClose={onClose}
        forceLorebookUnlock
      />,
    );

    expect(screen.getByTestId('stitched-timeline-lorebook')).toBeInTheDocument();
    expect(screen.getByTestId('lorebook-content-meter')).toBeInTheDocument();
    expect(screen.getByTestId('stitched-timeline-continue-chat')).toBeInTheDocument();

    await user.click(screen.getByTestId('stitched-timeline-continue-chat'));
    expect(openStitchedTimelineChat).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Agency Years',
        lifeArcId: 'arc-1',
        scopeType: 'life_arc',
        autoSubmit: true,
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
