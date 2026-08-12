import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { OmniTimeline } from './OmniTimeline';

const entityModalMocks = vi.hoisted(() => ({
  openMemory: vi.fn(),
  openCharacter: vi.fn(),
}));

const demoCharacters = vi.hoisted(() => ([
  {
    id: 'demo-alex',
    name: 'Alex',
    first_name: 'Alex',
    alias: ['Alex'],
    role: 'Girlfriend',
    importance_score: 95,
    metadata: { relationship_type: 'romantic' },
  },
]));

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

vi.mock('../../hooks/useLoreReadiness', () => ({
  useLoreReadiness: vi.fn(() => ({
    readiness: null,
    compiledBooks: [],
    loading: false,
    refresh: vi.fn(),
    hasCompiledBook: false,
    isSimulated: false,
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
  useEntityModal: vi.fn(() => entityModalMocks),
}));

vi.mock('../../services/mockDataService', () => ({
  mockDataService: {
    get: {
      characters: () => demoCharacters,
    },
  },
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
  TimelineGeneratingSimulation: ({
    query,
    onComplete,
  }: {
    query: string;
    onComplete: () => void;
  }) => (
    <div data-testid="timeline-generating-simulation">
      {query}
      <button type="button" onClick={onComplete}>Finish generation</button>
    </div>
  ),
}));

vi.mock('./GeneratedTimelineReveal', () => ({
  GeneratedTimelineReveal: ({
    query,
    events,
    compilation,
    onOpenChat,
    onEventClick,
  }: {
    query: string;
    events?: Array<{ content?: string; timeline_names?: string[] }>;
    compilation?: { subject?: { displayName?: string } | null };
    onOpenChat?: () => void;
    onEventClick?: (event: { content?: string; timeline_names?: string[] }) => void;
  }) => (
    <div data-testid="generated-timeline-reveal">
      {query} · {events?.length ?? 0} · {compilation?.subject?.displayName ?? 'unresolved'}
      {onOpenChat && <button type="button" onClick={onOpenChat}>Open in chat</button>}
      {onEventClick && events?.[0] && (
        <button type="button" onClick={() => onEventClick(events[0])}>Open first moment</button>
      )}
    </div>
  ),
}));

vi.mock('../../api/subjectTimeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/subjectTimeline')>();
  return {
    ...actual,
    subjectTimelineApi: {
      compile: vi.fn(),
    },
  };
});

import { useIsMobile } from '../../hooks/useIsMobile';
import { useLifeArcs } from '../../hooks/useLifeArcs';
import { useStitchedTimeline } from '../../hooks/useStitchedTimeline';
import { useMockData } from '../../contexts/MockDataContext';
import { useAuth } from '../../lib/supabase';
import { subjectTimelineApi } from '../../api/subjectTimeline';

function renderOmniTimeline(initialRoute = '/timeline') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <OmniTimeline />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-probe">{location.pathname + location.search}</output>;
}

describe('OmniTimeline layout and navigation', () => {
  beforeEach(() => {
    entityModalMocks.openMemory.mockReset();
    entityModalMocks.openCharacter.mockReset();
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

    await user.click(screen.getByRole('tab', { name: /chronology/i }));
    expect(screen.getByTestId('timeline-stitched-embedded')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /calendar/i }));
    expect(screen.getByTestId('timeline-calendar-view')).toBeInTheDocument();
  });

  it('opens calendar from ?view=calendar deep link', () => {
    renderOmniTimeline('/timeline?view=calendar');
    expect(screen.getByTestId('timeline-calendar-view')).toBeInTheDocument();
  });

  it('opens Timelines Library from ?view=library deep link', () => {
    renderOmniTimeline('/timeline?view=library');
    expect(screen.getByTestId('generated-timeline-library')).toBeInTheDocument();
    expect(screen.getByTestId('generated-timeline-library-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('universal-timeline-search-desktop')).not.toBeInTheDocument();
  });

  it('switches to Library from desktop tabs', async () => {
    const user = userEvent.setup();
    renderOmniTimeline();

    await user.click(screen.getByRole('tab', { name: /library/i }));
    expect(screen.getByTestId('generated-timeline-library')).toBeInTheDocument();
  });

  it('opens universal search from ?view=search without treating search as a view tab', () => {
    renderOmniTimeline('/timeline?view=search');
    expect(screen.getByTestId('timeline-swimlanes-view')).toBeInTheDocument();
    expect(screen.getByTestId('universal-timeline-search-desktop')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^search$/i })).not.toBeInTheDocument();
  });

  it('offers a working back path when opened from Narrative Anchors', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/timeline',
            search: '?view=search&q=The%20college%20years',
            state: { from: '/narrative-anchors' },
          },
        ]}
      >
        <OmniTimeline />
        <LocationProbe />
      </MemoryRouter>,
    );

    const back = screen.getByRole('button', { name: /back to narrative anchors/i });
    expect(back).toBeInTheDocument();
    await user.click(back);
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/narrative-anchors');
  });

  it('opens a simulated subject in main chat without passing preview moments as evidence', async () => {
    const user = userEvent.setup();
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    renderOmniTimeline('/timeline?q=Everything%20with%20Alex');

    await user.click(screen.getByRole('button', { name: 'Open in chat' }));

    const event = dispatch.mock.calls
      .map(([value]) => value)
      .find((value) => value.type === 'lorebook:open-chat-focus') as CustomEvent;
    expect(event.detail.entityName).toBe('Everything with Alex');
    expect(event.detail.sourceSurface).toBe('timeline');
    expect(event.detail.knowledgeScope).toContain('simulated preview only');
  });

  it('opens the matching Character Book modal from a demo person timeline moment', async () => {
    const user = userEvent.setup();
    renderOmniTimeline('/timeline?q=Everything%20with%20Alex');

    await user.click(screen.getByRole('button', { name: 'Open first moment' }));

    expect(entityModalMocks.openCharacter).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'demo-alex', name: 'Alex' }),
    );
    expect(entityModalMocks.openMemory).not.toHaveBeenCalled();
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

  it('uses the subject compiler for authenticated generated timelines', async () => {
    const user = userEvent.setup();
    vi.mocked(useMockData).mockReturnValue({ useMockData: false } as ReturnType<typeof useMockData>);
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } as never, loading: false });
    vi.mocked(subjectTimelineApi.compile).mockResolvedValue({
      query: 'My time at Vanguard Robotics',
      intent: {
        rawQuery: 'My time at Vanguard Robotics',
        mode: 'EMPLOYMENT_TIMELINE',
        subjectQuery: 'Vanguard Robotics',
        perspective: 'FIRST_PERSON_EXPERIENCE',
        expectedPhases: ['prelude', 'beginning', 'active_period', 'transition', 'aftermath'],
      },
      subject: {
        entityId: '11111111-1111-4111-8111-111111111111',
        entityType: 'organization',
        displayName: 'Vanguard Robotics',
        aliases: [],
        confidence: 1,
      },
      ambiguity: [],
      period: null,
      coverage: {
        score: 0.2,
        coveredPhases: ['beginning'],
        missingPhases: ['prelude', 'active_period', 'transition', 'aftermath'],
        isComplete: false,
      },
      events: [
        {
          id: 'event:work',
          start_time: '2026-06-24T09:00:00.000Z',
          title: 'First day',
          content: 'Joined the lab.',
          timeline_names: ['Beginning'],
          source_kind: 'resolved_event',
          source_id: 'work',
          source_ids: ['work'],
          source_type: 'resolved_event',
          time_precision: 'date',
          time_confidence: 0.95,
          phase: 'beginning',
          subjectRelation: 'DIRECT_WORK_ACTIVITY',
          relevance: 0.98,
          significance: 'high',
          evidenceCount: 1,
          whyIncluded: 'Directly linked work event',
          focusedEvidence: 'Joined the lab.',
        },
      ],
      contextEvents: [],
      sources: ['resolved_event'],
      warnings: [],
    });

    renderOmniTimeline();
    const input = screen.getByRole('textbox', { name: /generate a timeline/i });
    await user.type(input, 'My time at Vanguard Robotics');
    await user.click(screen.getByRole('button', { name: /^generate$/i }));
    expect(screen.getByTestId('timeline-generating-simulation')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /finish generation/i }));
    expect(await screen.findByTestId('generated-timeline-reveal')).toHaveTextContent(
      'My time at Vanguard Robotics · 1 · Vanguard Robotics',
    );
    expect(subjectTimelineApi.compile).toHaveBeenCalledWith(
      'My time at Vanguard Robotics',
      undefined,
    );
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
