import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OmniTimeline } from './OmniTimeline';

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock('../../hooks/useLifeArcs', () => ({
  useLifeArcs: vi.fn(() => ({
    arcs: [],
    activeArcs: [],
    arcsByTrack: {},
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

vi.mock('../../hooks/useStitchedTimeline', () => ({
  useStitchedTimeline: vi.fn(() => ({
    items: [],
    loading: false,
    error: null,
    reload: vi.fn(),
  })),
}));

vi.mock('../../hooks/useGeneratedTimelinesLibrary', () => ({
  useGeneratedTimelinesLibrary: vi.fn(() => ({
    library: [],
    saveTimeline: vi.fn(),
    removeTimeline: vi.fn(),
    setTimelineCollapsed: vi.fn(),
    findByQuery: vi.fn(),
    getById: vi.fn(),
  })),
}));

vi.mock('../../store/api/loreApi', () => ({
  useGetChaptersQuery: vi.fn(() => ({ data: { candidates: [] } })),
}));

vi.mock('../../lib/supabase', () => ({
  useAuth: vi.fn(() => ({ user: null, loading: false })),
}));

vi.mock('../../contexts/GuestContext', () => ({
  useGuest: vi.fn(() => ({ isGuest: true })),
}));

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: vi.fn(() => ({ useMockData: true })),
}));

vi.mock('../../contexts/EntityModalContext', () => ({
  useEntityModal: vi.fn(() => ({ openMemory: vi.fn() })),
}));

vi.mock('../ChatFirstViewHint', () => ({
  ChatFirstViewHint: () => null,
}));

vi.mock('./TimelineSwimlanes', () => ({
  TimelineSwimlanes: () => <div data-testid="timeline-swimlanes-view">Swimlanes view</div>,
}));

vi.mock('./TimelineStitchedView', () => ({
  TimelineStitchedView: ({
    embedded,
    lifeArcId,
    scopeLabel,
  }: {
    embedded?: boolean;
    lifeArcId?: string;
    scopeLabel?: string;
  }) => (
    <div data-testid={embedded ? 'timeline-stitched-embedded' : 'timeline-stitched-modal'}>
      {lifeArcId ? `${scopeLabel} · ${lifeArcId}` : 'Stitched view'}
    </div>
  ),
}));

vi.mock('./TimelineCalendarView', () => ({
  TimelineCalendarView: () => <div data-testid="timeline-calendar-view">Calendar view</div>,
}));

vi.mock('./TimelineStoryView', () => ({
  TimelineStoryView: () => <div data-testid="timeline-story-view">Story view</div>,
}));

vi.mock('./TimelineGeneratingSimulation', () => ({
  TimelineGeneratingSimulation: ({ query }: { query: string }) => (
    <div data-testid="timeline-generating-simulation">{query}</div>
  ),
}));

vi.mock('./GeneratedTimelineReveal', () => ({
  GeneratedTimelineReveal: ({ query }: { query: string }) => (
    <div data-testid="generated-timeline-reveal">{query}</div>
  ),
}));

import { useIsMobile } from '../../hooks/useIsMobile';
import { useLifeArcs } from '../../hooks/useLifeArcs';
import { useStitchedTimeline } from '../../hooks/useStitchedTimeline';
import { useMockData } from '../../contexts/MockDataContext';
import { useAuth } from '../../lib/supabase';

function renderOmniTimeline(initialRoute = '/timeline') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <OmniTimeline />
    </MemoryRouter>,
  );
}

describe('OmniTimeline layout and navigation', () => {
  beforeEach(() => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    vi.mocked(useMockData).mockReturnValue({ useMockData: true } as ReturnType<typeof useMockData>);
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false });
    vi.mocked(useLifeArcs).mockReturnValue({
      arcs: [],
      activeArcs: [],
      arcsByTrack: {},
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    vi.mocked(useStitchedTimeline).mockReturnValue({
      data: null,
      items: [],
      loading: false,
      saving: false,
      error: null,
      reload: vi.fn(),
      reorderItems: vi.fn(),
      persistOrder: vi.fn(),
    });
  });

  it('renders shell with vertical scroll region', () => {
    renderOmniTimeline();
    expect(screen.getByTestId('omni-timeline')).toHaveClass('omni-timeline-root');
    const scroll = screen.getByTestId('omni-timeline-scroll');
    expect(scroll).toHaveClass('omni-timeline-body');
  });

  it('shows desktop universal search in scroll body', () => {
    renderOmniTimeline();
    expect(screen.getByTestId('universal-timeline-search-desktop')).toBeInTheDocument();
  });

  it('switches embedded views from desktop tabs', async () => {
    const user = userEvent.setup();
    renderOmniTimeline();

    expect(screen.getByTestId('timeline-swimlanes-view')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /events/i }));
    expect(screen.getByTestId('timeline-stitched-embedded')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /calendar/i }));
    expect(screen.getByTestId('timeline-calendar-view')).toBeInTheDocument();
  });

  it('shows data error banner with retry', async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();
    const refetch = vi.fn();

    vi.mocked(useMockData).mockReturnValue({ useMockData: false } as ReturnType<typeof useMockData>);
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } as never, loading: false });
    vi.mocked(useLifeArcs).mockReturnValue({
      arcs: [],
      activeArcs: [],
      arcsByTrack: {},
      loading: false,
      error: 'Failed to load life arcs',
      refresh,
    });
    vi.mocked(useStitchedTimeline).mockReturnValue({
      data: null,
      items: [],
      loading: false,
      saving: false,
      error: null,
      reload: refetch,
      reorderItems: vi.fn(),
      persistOrder: vi.fn(),
    });

    renderOmniTimeline();
    expect(screen.getByTestId('omni-timeline-error')).toHaveTextContent('Failed to load life arcs');
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('opens generated timeline from URL query in demo mode', () => {
    renderOmniTimeline('/timeline?q=nightlife');
    expect(screen.getByTestId('generated-timeline-reveal')).toHaveTextContent('nightlife');
  });

  it('opens the scoped stitched timeline when clicking an active arc in demo mode', async () => {
    const user = userEvent.setup();
    vi.mocked(useLifeArcs).mockReturnValue({
      arcs: [
        {
          id: 'mock-arc-agency',
          title: 'Agency Years',
          arc_type: 'work',
          track: 'career',
          dominant_emotion: null,
          emotional_arc: null,
          parent_id: null,
          start_date: '2020-01-01',
          end_date: null,
          is_active: true,
          summary: 'Building career momentum',
          confidence: 0.9,
          source: 'inferred',
          tags: [],
        },
      ],
      activeArcs: [
        {
          id: 'mock-arc-agency',
          title: 'Agency Years',
          arc_type: 'work',
          track: 'career',
          dominant_emotion: null,
          emotional_arc: null,
          parent_id: null,
          start_date: '2020-01-01',
          end_date: null,
          is_active: true,
          summary: 'Building career momentum',
          confidence: 0.9,
          source: 'inferred',
          tags: [],
        },
      ],
      arcsByTrack: {},
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    renderOmniTimeline();
    await user.click(screen.getByRole('button', { name: /Agency Years/i }));
    expect(screen.getByTestId('timeline-stitched-modal')).toHaveTextContent(
      'Agency Years · mock-arc-agency',
    );
  });
});

describe('OmniTimeline mobile shell', () => {
  beforeEach(() => {
    vi.mocked(useIsMobile).mockReturnValue(true);
  });

  it('shows bottom navigation and mobile search panel when opened', async () => {
    const user = userEvent.setup();
    renderOmniTimeline();

    expect(screen.getByRole('navigation', { name: /timeline views/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /generate a timeline/i }));
    expect(screen.getByTestId('universal-timeline-search-mobile')).toBeInTheDocument();
  });
});
