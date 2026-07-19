import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ backendUnavailable: false }),
}));

vi.mock('../../contexts/EntityModalContext', () => ({
  useEntityModal: () => ({ openMemory: vi.fn() }),
}));

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
    items: [],
    loading: false,
    saving: false,
    error: null,
    reorderItems: vi.fn(),
    persistOrder: vi.fn(),
  }),
}));

import { TimelineStitchedView } from './TimelineStitchedView';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
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
});
