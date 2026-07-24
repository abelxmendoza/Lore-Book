/**
 * OmniTimeline — clean shell replacing OmniTimelinePanel.
 * Fetches arc + chronology data once, routes between three views.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutTemplate, BookOpen, Search, Sparkles, Menu, CalendarDays, Calendar, X, Clock3 } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useLifeArcs, type LifeArc } from '../../hooks/useLifeArcs';
import { useStitchedTimeline } from '../../hooks/useStitchedTimeline';
import { useMockData } from '../../contexts/MockDataContext';
import { useAuth } from '../../lib/supabase';
import { useGuest } from '../../contexts/GuestContext';
import { useEntityModal } from '../../contexts/EntityModalContext';
import { TimelineSwimlanes } from './TimelineSwimlanes';
import { TimelineStoryView } from './TimelineStoryView';
import { TimelineStitchedView } from './TimelineStitchedView';
import { TimelineCalendarView } from './TimelineCalendarView';
import { OmniTimelineBottomNav, type OmniTimelineView } from './OmniTimelineBottomNav';
import { useGetChaptersQuery } from '../../store/api/loreApi';
import { TimelineGeneratingSimulation } from './TimelineGeneratingSimulation';
import { GeneratedTimelineReveal, type GeneratedTimelineEvent } from './GeneratedTimelineReveal';
import { GeneratedTimelineLibraryPanel } from './GeneratedTimelineLibraryPanel';
import { buildMockGeneratedTimeline } from '../../mocks/timelineGenerationMock';
import { DEMO_GENERATED_TIMELINE_SEEDS } from '../../mocks/stitchedTimelineMock';
import { useGeneratedTimelinesLibrary } from '../../hooks/useGeneratedTimelinesLibrary';
import type { SavedGeneratedTimeline } from '../../lib/generatedTimelinesLibrary';
import {
  compilationSummary,
  subjectTimelineApi,
  type SubjectTimelineCompilation,
  type SubjectTimelineCompilationSummary,
  type ResolvedTimelineSubject,
} from '../../api/subjectTimeline';
import { OmniTimelineErrorBanner } from './OmniTimelineErrorBanner';
import { UniversalTimelineSearch } from './UniversalTimelineSearch';
import { KnowledgeBaseCreator, type LorebookCreatorPrefill } from '../lorebook/KnowledgeBaseCreator';
import { StorySurfaceLinks } from '../story/StorySurfaceLinks';
import { lorebookLibraryUrl } from '../../lib/lorebookLibrary';
import { stitchedItemsToChronology } from '../../lib/unifiedTimeline';
import { useLoreReadiness } from '../../hooks/useLoreReadiness';
import {
  evaluateArcLorebookOffer,
  evaluateTimelineSubjectLorebookOffer,
} from '../../lib/timelineSubjectLorebook';
import { meterFromTimelineOffer } from '../../lib/lorebookContentMeter';
import type { LorebookForm } from '../../lib/lorebookTiers';
import './OmniTimeline.css';

type View = OmniTimelineView;
type GenPhase = 'idle' | 'generating' | 'revealed';

const VIEWS: { id: View; label: string; shortLabel: string; Icon: React.ElementType; desc: string }[] = [
  { id: 'swimlanes', label: 'Swimlanes', shortLabel: 'Lanes', Icon: LayoutTemplate, desc: 'Your life across parallel tracks in calendar time' },
  { id: 'events',    label: 'Chronology', shortLabel: 'Chronology', Icon: CalendarDays,  desc: 'Same scenes stitched in time — copyable, with an explicit reorder mode' },
  { id: 'calendar',  label: 'Calendar',  shortLabel: 'Calendar', Icon: Calendar,  desc: 'Named occasions and events by day' },
  { id: 'story',     label: 'Story',     shortLabel: 'Story', Icon: BookOpen,       desc: 'Read life arcs in order' },
  { id: 'library',   label: 'Library',   shortLabel: 'Library', Icon: Clock3,       desc: 'All generated timeline history you’ve spun up' },
];

const BOTTOM_NAV = VIEWS.map(({ id, shortLabel, Icon }) => ({
  id,
  label: shortLabel,
  Icon,
}));

// Seed prompts for the Universal Timeline Search — show the user the *kinds* of
// timelines they can spin up from their conversations + lorebooks. Click to run.
const TIMELINE_SUGGESTIONS = [
  'My nightlife era',
  'Everything with Alex',
  '2024 career',
  'Family & holidays',
  'Where I’ve lived',
  'Heartbreaks & love',
  'Friendships over the years',
];

type OmniTimelineProps = {
  onOpenAppSidebar?: () => void;
};

const VALID_VIEWS = new Set<View>(['swimlanes', 'events', 'calendar', 'story', 'library']);

function viewFromSearchParams(params: URLSearchParams): View {
  const raw = params.get('view');
  // `search` opens Universal Timeline Search (overlay), not a peer view tab.
  if (raw === 'search') return 'swimlanes';
  if (raw && VALID_VIEWS.has(raw as View)) return raw as View;
  return 'swimlanes';
}

export const OmniTimeline = ({ onOpenAppSidebar }: OmniTimelineProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlQuery = searchParams.get('q') ?? '';
  const characterId = searchParams.get('characterId') ?? undefined;
  const calendarDateParam =
    searchParams.get('date') ??
    (/^\d{4}-\d{2}-\d{2}$/.test(urlQuery) ? urlQuery : null);
  const isMobile = useIsMobile();
  const [view, setViewState] = useState<View>(() => viewFromSearchParams(searchParams));
  const [stitchedArc, setStitchedArc] = useState<LifeArc | null>(null);
  const [lorebookPrefill, setLorebookPrefill] = useState<LorebookCreatorPrefill | null>(null);

  const handleCalendarDateChange = useCallback(
    (dateKey: string) => {
      const params = new URLSearchParams(searchParams);
      params.set('view', 'calendar');
      params.set('date', dateKey);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // Keep view in sync with ?view= so Life Log / deep links share one calendar.
  useEffect(() => {
    const next = viewFromSearchParams(searchParams);
    setViewState((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  const setView = useCallback(
    (next: View) => {
      setViewState(next);
      const params = new URLSearchParams(searchParams);
      if (next === 'swimlanes') params.delete('view');
      else params.set('view', next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const [genInput, setGenInput] = useState(urlQuery);
  const [dateInput, setDateInput] = useState(/^\d{4}-\d{2}-\d{2}$/.test(urlQuery) ? urlQuery : '');
  const [genQuery, setGenQuery] = useState(urlQuery);

  const handleOpenDayInTimeline = useCallback(
    (dateKey: string) => {
      const params = new URLSearchParams(searchParams);
      params.set('view', 'events');
      params.set('q', dateKey);
      params.delete('date');
      setSearchParams(params, { replace: true });
      setDateInput(dateKey);
      setGenInput(dateKey);
      setGenQuery(dateKey);
    },
    [searchParams, setSearchParams],
  );

  const [genPhase, setGenPhase] = useState<GenPhase>(urlQuery.trim() ? 'revealed' : 'idle');
  const [genSearchOpen, setGenSearchOpen] = useState(
    Boolean(urlQuery.trim()) || searchParams.get('view') === 'search',
  );
  const [activeTimelineId, setActiveTimelineId] = useState<string | null>(null);
  /** Local collapse — library sync is best-effort; never block the button on a missing id. */
  const [revealCollapsed, setRevealCollapsed] = useState(false);
  const [subjectCompilation, setSubjectCompilation] = useState<SubjectTimelineCompilation | null>(null);
  const [subjectCompileError, setSubjectCompileError] = useState<string | null>(null);
  const compileRequestIdRef = useRef(0);
  const selectedCompileSubjectRef = useRef<ResolvedTimelineSubject | null>(null);
  const shouldPersistRef = useRef(false);
  const demoLibrarySeededRef = useRef(false);

  const {
    library: savedTimelines,
    saveTimeline,
    removeTimeline,
    setTimelineCollapsed,
    findByQuery,
    getById,
  } = useGeneratedTimelinesLibrary();

  const { user }                     = useAuth();
  const { isGuest }                  = useGuest();
  const { useMockData: mockEnabled } = useMockData();
  const { openMemory }               = useEntityModal();
  const { readiness }                = useLoreReadiness();
  const isDemoMode = !user && (isGuest ? mockEnabled : mockEnabled);

  const { arcs, activeArcs, arcsByTrack, loading: arcsLoading, error: arcsError, refresh: refreshArcs } = useLifeArcs();
  const {
    items: stitchedItems,
    unresolvedItems,
    loading: entriesLoading,
    error: chronologyError,
    reload: refetchChronology,
  } = useStitchedTimeline({ scope_type: 'global', character_id: characterId });
  const entries = useMemo(
    () => stitchedItemsToChronology(stitchedItems, user?.id),
    [stitchedItems, user?.id],
  );

  // Birth-year-anchored life eras (Childhood / Twenties / …). These are the
  // `lifestage-*` chapter candidates produced server-side from resolved event
  // times; surfaced here as a compact "Life Chapters" overview strip. RTK Query
  // dedupes with the LoreKeeper context's chapters fetch, so this is ~free.
  const { data: chaptersData } = useGetChaptersQuery(undefined, { skip: isDemoMode });
  const lifeEras = useMemo(
    () => (chaptersData?.candidates ?? []).filter((c) => c.id.startsWith('lifestage-')),
    [chaptersData],
  );

  // Click a life-era pill to filter the timeline to that era's calendar window.
  const [selectedEraId, setSelectedEraId] = useState<string | null>(null);
  const selectedEra = useMemo(
    () => lifeEras.find((e) => e.id === selectedEraId) ?? null,
    [lifeEras, selectedEraId],
  );
  const displayEntries = useMemo(() => {
    if (!selectedEra) return entries;
    const from = new Date(selectedEra.start_date).getTime();
    const to = new Date(selectedEra.end_date).getTime();
    return entries.filter((e) => {
      const t = new Date(e.start_time).getTime();
      return Number.isFinite(t) && t >= from && t <= to;
    });
  }, [entries, selectedEra]);

  const loading = arcsLoading || entriesLoading;

  const dataError = useMemo(() => {
    if (isDemoMode || loading) return null;
    return arcsError ?? chronologyError ?? null;
  }, [isDemoMode, loading, arcsError, chronologyError]);

  const handleRetryData = useCallback(() => {
    void refreshArcs();
    void refetchChronology();
  }, [refreshArcs, refetchChronology]);

  const statsLabel = useMemo(() => {
    if (isDemoMode) return 'Demo';
    if (arcs.length > 0) return `${arcs.length} · ${entries.length}`;
    if (entries.length > 0) return `${entries.length}`;
    return null;
  }, [isDemoMode, arcs.length, entries.length]);

  const genTerms = genQuery.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 2);

  const matchingArcs = useMemo(() => {
    if (!genQuery.trim()) return [];
    return arcs.filter((a) => {
      const hay = `${a.title ?? ''} ${a.track ?? ''} ${a.arc_type ?? ''} ${a.summary ?? ''}`.toLowerCase();
      return genTerms.some((t) => hay.includes(t));
    });
  }, [genQuery, arcs, genTerms]);

  useEffect(() => {
    if (urlQuery.trim() || searchParams.get('view') === 'search') {
      setGenSearchOpen(true);
    }
  }, [urlQuery, searchParams]);

  useEffect(() => {
    if (!urlQuery.trim()) return;
    const cached = findByQuery(urlQuery);
    if (cached) setActiveTimelineId(cached.id);
  }, [urlQuery, findByQuery]);

  const computeFreshReveal = useCallback(
    (query: string): { events: GeneratedTimelineEvent[]; isMock: boolean } => {
      if (isDemoMode) {
        return { events: buildMockGeneratedTimeline(query), isMock: true };
      }
      if (subjectCompilation?.query === query) {
        return { events: subjectCompilation.events, isMock: false };
      }
      return { events: [], isMock: false };
    },
    [isDemoMode, subjectCompilation],
  );

  const openSavedTimeline = useCallback((saved: SavedGeneratedTimeline) => {
    setGenInput(saved.query);
    setGenQuery(saved.query);
    setActiveTimelineId(saved.id);
    setRevealCollapsed(Boolean(saved.collapsed));
    setSubjectCompileError(null);
    setSubjectCompilation(
      saved.compilation
        ? {
            query: saved.query,
            ...saved.compilation,
            events: saved.events as SubjectTimelineCompilation['events'],
          }
        : null,
    );
    setGenPhase('revealed');
    if (isMobile) setGenSearchOpen(false);
  }, [isMobile]);

  const generateFor = useCallback((
    raw: string,
    options?: { forceRegenerate?: boolean; instant?: boolean },
  ) => {
    const q = raw.trim();
    if (!q) return;
    setGenInput(q);
    setGenQuery(q);

    if (!options?.forceRegenerate) {
      const cached = findByQuery(q);
      if (cached) {
        openSavedTimeline(cached);
        return;
      }
    }

    setActiveTimelineId(null);
    setRevealCollapsed(false);
    setSubjectCompilation(null);
    setSubjectCompileError(null);
    selectedCompileSubjectRef.current = null;
    shouldPersistRef.current = true;
    setGenPhase(options?.instant && isDemoMode ? 'revealed' : 'generating');
    if (isMobile) setGenSearchOpen(false);
  }, [findByQuery, openSavedTimeline, isMobile, isDemoMode]);

  const handleOpenArcTimeline = useCallback((arc: LifeArc) => {
    setStitchedArc(arc);
  }, []);

  // ── LoreBook-from-timeline: progressive form tiers unlock with content. ─
  const handleCreateLorebookFromArc = useCallback(
    (arc: LifeArc, form?: LorebookForm) => {
      const offer = evaluateArcLorebookOffer({ arc, entries: displayEntries, readiness });
      const meter = meterFromTimelineOffer(offer);
      const canAny = Boolean(meter.tierOffer?.canCreateAny) || isDemoMode;
      if (!canAny) return;
      const selected =
        form ?? meter.tierOffer?.highestUnlocked ?? (isDemoMode ? 'vignette' : undefined);
      if (!selected) return;
      setLorebookPrefill({
        ...offer.prefill,
        form: selected,
        unlockedForms: meter.tierOffer?.unlocked,
      });
    },
    [displayEntries, readiness, isDemoMode],
  );

  const canCreateLorebookForArc = useCallback(
    (arc: LifeArc) => {
      const offer = evaluateArcLorebookOffer({ arc, entries: displayEntries, readiness });
      const meter = meterFromTimelineOffer(offer);
      return {
        canCreate: Boolean(meter.tierOffer?.canCreateAny) || isDemoMode,
        reason: offer.reason,
        meter,
      };
    },
    [displayEntries, readiness, isDemoMode],
  );

  useEffect(() => {
    if (!isDemoMode || demoLibrarySeededRef.current || savedTimelines.length > 0) return;
    demoLibrarySeededRef.current = true;
    for (const query of DEMO_GENERATED_TIMELINE_SEEDS) {
      saveTimeline({
        query,
        events: buildMockGeneratedTimeline(query),
        isMock: true,
      });
    }
  }, [isDemoMode, savedTimelines.length, saveTimeline]);

  const submitGenSearch = () => generateFor(genInput);
  const submitDateSearch = () => {
    if (!dateInput) return;
    generateFor(dateInput, { forceRegenerate: true, instant: true });
  };

  const closeGeneratedTimeline = () => {
    setGenQuery('');
    setGenInput('');
    setGenPhase('idle');
    setActiveTimelineId(null);
    setRevealCollapsed(false);
    setDateInput('');
    setSubjectCompilation(null);
    setSubjectCompileError(null);
    compileRequestIdRef.current += 1;
    selectedCompileSubjectRef.current = null;
  };

  const handleToggleRevealCollapse = useCallback(() => {
    setRevealCollapsed((prev) => {
      const next = !prev;
      const id = activeTimelineId ?? findByQuery(genQuery)?.id;
      if (id) setTimelineCollapsed(id, next);
      return next;
    });
  }, [activeTimelineId, findByQuery, genQuery, setTimelineCollapsed]);

  const handleGenComplete = useCallback(async () => {
    if (isDemoMode) {
      setGenPhase('revealed');
      return;
    }
    const query = genQuery.trim();
    if (!query) {
      setGenPhase('idle');
      return;
    }
    const requestId = ++compileRequestIdRef.current;
    setSubjectCompileError(null);
    try {
      const selectedSubject = selectedCompileSubjectRef.current;
      const compilation = await subjectTimelineApi.compile(
        query,
        selectedSubject
          ? {
              entityId: selectedSubject.entityId,
              entityType: selectedSubject.entityType,
            }
          : undefined,
      );
      if (requestId !== compileRequestIdRef.current) return;
      setSubjectCompilation(compilation);
      setGenPhase('revealed');
    } catch (error) {
      if (requestId !== compileRequestIdRef.current) return;
      setSubjectCompilation(null);
      setSubjectCompileError(
        error instanceof Error ? error.message : 'Could not compile this subject timeline',
      );
      setGenPhase('revealed');
    }
  }, [genQuery, isDemoMode]);

  const handleSelectCompiledSubject = useCallback((subject: ResolvedTimelineSubject) => {
    selectedCompileSubjectRef.current = subject;
    setActiveTimelineId(null);
    setSubjectCompilation(null);
    setSubjectCompileError(null);
    shouldPersistRef.current = true;
    setGenPhase('generating');
  }, []);

  const activeSaved = useMemo(() => {
    if (activeTimelineId) return getById(activeTimelineId);
    if (genQuery.trim()) return findByQuery(genQuery);
    return undefined;
  }, [activeTimelineId, genQuery, getById, findByQuery]);

  // A real deep link has no client-side result to reveal. Preserve instant Demo
  // Mode previews, but send authenticated queries through the compiler.
  useEffect(() => {
    if (
      isDemoMode
      || !genQuery.trim()
      || genPhase !== 'revealed'
      || activeSaved
      || subjectCompilation
      || subjectCompileError
    ) {
      return;
    }
    shouldPersistRef.current = true;
    setGenPhase('generating');
  }, [
    activeSaved,
    genPhase,
    genQuery,
    isDemoMode,
    subjectCompilation,
    subjectCompileError,
  ]);

  const revealEvents = useMemo((): {
    events: GeneratedTimelineEvent[];
    isMock: boolean;
    fromLibrary: boolean;
    savedAt?: string;
    collapsed: boolean;
    compilation: SubjectTimelineCompilationSummary | null;
    contextEvents: SubjectTimelineCompilation['contextEvents'];
  } => {
    if (!genQuery.trim()) {
      return {
        events: [],
        isMock: false,
        fromLibrary: false,
        collapsed: false,
        compilation: null,
        contextEvents: [],
      };
    }

    if (genPhase === 'revealed' && activeSaved && !shouldPersistRef.current) {
      const savedEvents = activeSaved.events as GeneratedTimelineEvent[];
      const events =
        isDemoMode && savedEvents.length === 0
          ? buildMockGeneratedTimeline(genQuery)
          : savedEvents;
      return {
        events,
        isMock: isDemoMode ? true : activeSaved.isMock,
        fromLibrary: true,
        savedAt: activeSaved.updatedAt,
        collapsed: activeSaved.collapsed,
        compilation: activeSaved.compilation ?? null,
        contextEvents: activeSaved.compilation?.contextEvents ?? [],
      };
    }

    const fresh = computeFreshReveal(genQuery);
    return {
      ...fresh,
      fromLibrary: false,
      collapsed: false,
      compilation: subjectCompilation ? compilationSummary(subjectCompilation) : null,
      contextEvents: subjectCompilation?.contextEvents ?? [],
    };
  }, [genQuery, genPhase, activeSaved, computeFreshReveal, isDemoMode, subjectCompilation]);

  const revealLorebookOffer = useMemo(() => {
    if (!genQuery.trim()) return null;
    // Simulated previews don't count as real subject evidence.
    const eventsForOffer = revealEvents.isMock ? [] : revealEvents.events;
    const offer = evaluateTimelineSubjectLorebookOffer({
      subject: genQuery,
      events: eventsForOffer,
      readiness,
    });
    if (revealEvents.isMock) {
      return {
        ...offer,
        canCreate: false,
        reason:
          'Simulated preview — talk about this subject in chat so Omni can use real moments for a LoreBook.',
      };
    }
    return offer;
  }, [genQuery, revealEvents.events, revealEvents.isMock, readiness]);

  const revealLorebookMeter = useMemo(
    () => (revealLorebookOffer ? meterFromTimelineOffer(revealLorebookOffer) : null),
    [revealLorebookOffer],
  );

  const handleCreateLorebookFromReveal = useCallback(
    (form?: LorebookForm) => {
      if (!revealLorebookOffer) return;
      const canAny =
        Boolean(revealLorebookMeter?.tierOffer?.canCreateAny) ||
        (isDemoMode && revealLorebookOffer.eventCount > 0);
      if (!canAny && revealLorebookOffer.eventCount === 0) return;
      const selected =
        form ??
        revealLorebookMeter?.tierOffer?.highestUnlocked ??
        (isDemoMode ? 'vignette' : 'short_book');
      setLorebookPrefill({
        ...revealLorebookOffer.prefill,
        form: selected,
        unlockedForms: revealLorebookMeter?.tierOffer?.unlocked,
      });
    },
    [revealLorebookOffer, revealLorebookMeter, isDemoMode],
  );

  const canCreateLorebookForSaved = useCallback(
    (timeline: SavedGeneratedTimeline) => {
      if (timeline.isMock && !isDemoMode) {
        return {
          canCreate: false,
          reason:
            'Simulated preview — talk about this subject in chat so Omni can use real moments for a LoreBook.',
        };
      }
      const offer = evaluateTimelineSubjectLorebookOffer({
        subject: timeline.query,
        events: timeline.events as GeneratedTimelineEvent[],
        readiness,
      });
      const meter = meterFromTimelineOffer(offer);
      const canCreate =
        Boolean(meter.tierOffer?.canCreateAny) ||
        (isDemoMode && timeline.events.length > 0);
      return {
        canCreate,
        reason: canCreate
          ? offer.reason || 'Ready to compile a LoreBook from this timeline.'
          : offer.reason,
      };
    },
    [readiness, isDemoMode],
  );

  const handleCreateLorebookFromSaved = useCallback(
    (timeline: SavedGeneratedTimeline) => {
      const availability = canCreateLorebookForSaved(timeline);
      if (!availability.canCreate) return;
      const eventsForOffer = timeline.events as GeneratedTimelineEvent[];
      const offer = evaluateTimelineSubjectLorebookOffer({
        subject: timeline.query,
        events: eventsForOffer,
        readiness,
      });
      const meter = meterFromTimelineOffer(offer);
      const selected =
        meter.tierOffer?.highestUnlocked ?? (isDemoMode ? 'vignette' : 'short_book');
      setLorebookPrefill({
        ...offer.prefill,
        form: selected,
        unlockedForms: meter.tierOffer?.unlocked,
      });
    },
    [canCreateLorebookForSaved, readiness, isDemoMode],
  );

  useEffect(() => {
    if (genPhase !== 'revealed' || !genQuery.trim() || !shouldPersistRef.current) return;
    if (!isDemoMode && subjectCompilation?.query !== genQuery) return;
    shouldPersistRef.current = false;
    const fresh = computeFreshReveal(genQuery);
    const saved = saveTimeline({
      query: genQuery,
      events: fresh.events,
      isMock: fresh.isMock,
      arcTitles: matchingArcs.map((a) => a.title),
      existingId: activeTimelineId ?? activeSaved?.id,
      collapsed: revealCollapsed,
      compilation: subjectCompilation ? compilationSummary(subjectCompilation) : undefined,
    });
    if (saved?.id) setActiveTimelineId(saved.id);
  }, [
    genPhase,
    genQuery,
    computeFreshReveal,
    saveTimeline,
    matchingArcs,
    activeTimelineId,
    activeSaved,
    revealCollapsed,
    isDemoMode,
    subjectCompilation,
  ]);

  const handleRemoveSaved = (id: string) => {
    removeTimeline(id);
    if (activeTimelineId === id) closeGeneratedTimeline();
  };

  const libraryPanel = (
    <GeneratedTimelineLibraryPanel
      timelines={savedTimelines}
      activeId={activeTimelineId}
      onOpen={openSavedTimeline}
      onRemove={handleRemoveSaved}
      onCreateLorebook={handleCreateLorebookFromSaved}
      canCreateLorebook={canCreateLorebookForSaved}
      variant="page"
      onGenerateNew={() => {
        setGenSearchOpen(true);
        setView('swimlanes');
      }}
    />
  );

  const renderContent = () => {
    if (genQuery && genPhase === 'generating') {
      return (
        <TimelineGeneratingSimulation
          key={genQuery}
          query={genQuery}
          onComplete={handleGenComplete}
        />
      );
    }

    if (genQuery && genPhase === 'revealed') {
      return (
        <GeneratedTimelineReveal
          query={genQuery}
          events={revealEvents.events}
          arcs={matchingArcs}
          isMock={revealEvents.isMock}
          collapsed={revealCollapsed}
          fromLibrary={revealEvents.fromLibrary}
          savedAt={revealEvents.savedAt}
          onToggleCollapse={handleToggleRevealCollapse}
          onClose={closeGeneratedTimeline}
          onRegenerate={() => generateFor(genQuery, { forceRegenerate: true })}
          onCreateLorebook={
            revealLorebookOffer ? handleCreateLorebookFromReveal : undefined
          }
          canCreateLorebook={
            Boolean(revealLorebookMeter?.tierOffer?.canCreateAny) ||
            (isDemoMode && Boolean(revealLorebookOffer))
          }
          lorebookReason={revealLorebookOffer?.reason}
          lorebookMeter={revealLorebookMeter}
          compilation={revealEvents.compilation}
          contextEvents={revealEvents.contextEvents}
          generationError={subjectCompileError}
          onSelectSubject={handleSelectCompiledSubject}
          onEventClick={(e) => {
            if (
              !revealEvents.isMock &&
              'timeline_memberships' in e &&
              (!e.source_kind || e.source_kind === 'journal_entry')
            ) {
              openMemory(e);
            }
          }}
          onArcClick={handleOpenArcTimeline}
        />
      );
    }

    switch (view) {
      case 'library':
        return libraryPanel;
      case 'swimlanes':
        return (
          <TimelineSwimlanes
            arcs={arcs}
            arcsByTrack={arcsByTrack}
            activeArcs={activeArcs}
            entries={displayEntries}
            loading={loading}
            unresolvedItems={unresolvedItems}
            lifeEras={lifeEras.map((era) => ({
              id: era.id,
              label: era.chapter_title,
              startDate: era.start_date,
              endDate: era.end_date,
            }))}
            onOpenArcTimeline={handleOpenArcTimeline}
            onCreateLorebook={handleCreateLorebookFromArc}
            canCreateLorebookForArc={canCreateLorebookForArc}
          />
        );
      case 'events':
        return (
          <TimelineStitchedView
            embedded
            newestFirst
            readiness={readiness}
            forceLorebookUnlock={isDemoMode}
            onCreateLorebook={({ form, offer, meter }) => {
              const canAny = Boolean(meter.tierOffer?.canCreateAny) || isDemoMode;
              if (!canAny) return;
              const selected =
                form ?? meter.tierOffer?.highestUnlocked ?? (isDemoMode ? 'vignette' : undefined);
              if (!selected) return;
              setLorebookPrefill({
                ...offer.prefill,
                form: selected,
                unlockedForms: meter.tierOffer?.unlocked,
              });
            }}
          />
        );
      case 'calendar':
        return (
          <TimelineCalendarView
            initialDate={calendarDateParam}
            onDateChange={handleCalendarDateChange}
            onOpenDayInTimeline={handleOpenDayInTimeline}
          />
        );
      case 'story':
        return (
          <TimelineStoryView
            arcs={arcs}
            entries={displayEntries}
            loading={loading}
            onOpenArcTimeline={handleOpenArcTimeline}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={`omni-timeline-root${view === 'story' ? ' omni-timeline-root--story' : ''}${view === 'calendar' ? ' omni-timeline-root--calendar' : ''}${view === 'library' ? ' omni-timeline-root--library' : ''}`}
      data-testid="omni-timeline"
    >
      {/* ── Mobile header ──────────────────────────────────────────────── */}
      {isMobile ? (
        <header
          className="omni-timeline-header"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          <div className="omni-timeline-header__row">
            {onOpenAppSidebar && (
              <button
                type="button"
                onClick={onOpenAppSidebar}
                className="omni-timeline-icon-btn"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="omni-timeline-title omni-timeline-title--mobile truncate">Timeline</h1>
                {statsLabel && (
                  <span
                    className={`omni-timeline-badge ${
                      isDemoMode ? 'omni-timeline-badge--demo' : 'omni-timeline-badge--stats'
                    }`}
                  >
                    {isDemoMode && <Sparkles className="inline h-2.5 w-2.5 mr-0.5 -mt-px" />}
                    {statsLabel}
                  </span>
                )}
              </div>
              {genQuery && (
                <p className="omni-timeline-gen-label">Showing: {genQuery}</p>
              )}
              <StorySurfaceLinks current="timeline" className="mt-1.5" />
            </div>
            <button
              type="button"
              onClick={() => {
                if (genQuery && !genSearchOpen) {
                  closeGeneratedTimeline();
                } else {
                  setGenSearchOpen(v => !v);
                }
              }}
              className={`omni-timeline-icon-btn ${
                genSearchOpen || genQuery ? 'omni-timeline-icon-btn--active' : ''
              }`}
              aria-label={genSearchOpen ? 'Close search' : 'Generate a timeline'}
            >
              {genSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </button>
          </div>
        </header>
      ) : (
        /* ── Desktop header ───────────────────────────────────────────── */
        <header
          className="omni-timeline-header"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="flex flex-row items-center justify-between gap-4 mt-1">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="omni-timeline-title omni-timeline-title--desktop">Timeline</h1>
                {isDemoMode && (
                  <span className="omni-timeline-badge omni-timeline-badge--demo">
                    <Sparkles className="h-2.5 w-2.5" />
                    Demo
                  </span>
                )}
              </div>
              <p className="omni-timeline-subtitle">
                Your life in time — arcs, chronology, and calendar.
              </p>
              {(arcs.length > 0 || entries.length > 0) && (
                <p className="mt-0.5 text-xs text-white/35">
                  {arcs.length > 0
                    ? `${arcs.length} arc${arcs.length !== 1 ? 's' : ''} · ${entries.length} memories`
                    : `${entries.length} memories`}
                </p>
              )}
              <StorySurfaceLinks current="timeline" className="mt-2" />
            </div>

            <div className="omni-timeline-view-tabs" role="tablist" aria-label="Timeline views">
              {VIEWS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  onClick={() => setView(id)}
                  title={VIEWS.find(v => v.id === id)?.desc}
                  aria-selected={view === id}
                  className={`omni-timeline-view-tab ${view === id ? 'omni-timeline-view-tab--active' : ''}`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>
      )}

      <div className="omni-timeline-body" data-testid="omni-timeline-scroll">
        {dataError && (
          <OmniTimelineErrorBanner message={dataError} onRetry={handleRetryData} />
        )}

        {!isMobile && view !== 'story' && view !== 'library' && (
          <UniversalTimelineSearch
            genInput={genInput}
            genQuery={genQuery}
            suggestions={TIMELINE_SUGGESTIONS}
            onInputChange={setGenInput}
            onSubmit={submitGenSearch}
            onClear={genQuery ? closeGeneratedTimeline : undefined}
            onSuggestionClick={generateFor}
            dateInput={dateInput}
            onDateInputChange={setDateInput}
            onDateSubmit={submitDateSearch}
            variant="desktop"
          />
        )}

        {/* Story already lists arcs — hide competing chrome to free reading height */}
        {view !== 'story' && view !== 'library' && !loading && !genQuery && activeArcs.length > 0 && (
          <div className="omni-timeline-active-arcs">
            <p className="omni-timeline-section-label">Active now</p>
            <div className="flex flex-wrap gap-2">
              {activeArcs.slice(0, isMobile ? 5 : 4).map((arc) => (
                <button
                  key={arc.id}
                  type="button"
                  onClick={() => handleOpenArcTimeline(arc)}
                  className="omni-timeline-arc-pill truncate"
                  title={arc.summary ?? arc.title}
                >
                  {arc.title}
                </button>
              ))}
              {activeArcs.length > (isMobile ? 5 : 4) && (
                <span className="text-[11px] text-white/30 self-center">
                  +{activeArcs.length - (isMobile ? 5 : 4)} more
                </span>
              )}
            </div>
          </div>
        )}

        {isMobile && genSearchOpen && (
          <UniversalTimelineSearch
            genInput={genInput}
            genQuery={genQuery}
            suggestions={TIMELINE_SUGGESTIONS}
            onInputChange={setGenInput}
            onSubmit={submitGenSearch}
            onClear={genQuery ? closeGeneratedTimeline : undefined}
            onSuggestionClick={generateFor}
            dateInput={dateInput}
            onDateInputChange={setDateInput}
            onDateSubmit={submitDateSearch}
            variant="mobile"
            suggestionLimit={5}
          />
        )}

      {/* ── Life Chapters strip — birth-year-anchored life eras ──────────── */}
      {view !== 'story' && view !== 'library' && !loading && !genQuery && lifeEras.length > 0 && (
        <div className="omni-timeline-life-chapters">
          <div className="flex items-center gap-2">
            <span className="omni-timeline-section-label shrink-0 mb-0">Life Chapters</span>
            <div className="flex flex-1 min-w-0 gap-1.5 overflow-x-auto scrollbar-hide">
              {lifeEras.map((era) => {
                const startYear = new Date(era.start_date).getFullYear();
                const endYear = new Date(era.end_date).getFullYear();
                const count = era.entry_ids?.length ?? 0;
                const active = era.id === selectedEraId;
                return (
                  <button
                    key={era.id}
                    type="button"
                    title={era.summary}
                    onClick={() => setSelectedEraId(active ? null : era.id)}
                    className={`omni-timeline-era-pill ${active ? 'omni-timeline-era-pill--active' : ''}`}
                  >
                    <span className="font-medium">{era.chapter_title}</span>
                    <span className={`ml-1 ${active ? 'text-white/70' : 'text-white/40'}`}>
                      {startYear === endYear ? startYear : `${startYear}–${endYear}`}
                    </span>
                    {count > 0 && <span className={`ml-1 ${active ? 'text-white/60' : 'text-white/30'}`}>· {count}</span>}
                  </button>
                );
              })}
              {selectedEraId && (
                <button
                  type="button"
                  onClick={() => setSelectedEraId(null)}
                  className="omni-timeline-era-clear"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Timelines Library is a peer view under Omni Timeline (?view=library). */}

      <main className="omni-timeline-main">
        {renderContent()}
      </main>
      </div>

      {/* ── Mobile bottom navigation ───────────────────────────────────── */}
      {isMobile && !genQuery && (
        <OmniTimelineBottomNav view={view} onViewChange={setView} items={BOTTOM_NAV} />
      )}

      {stitchedArc && (
        <TimelineStitchedView
          lifeArcId={stitchedArc.id}
          scopeLabel={stitchedArc.title}
          onClose={() => setStitchedArc(null)}
          readiness={readiness}
          forceLorebookUnlock={isDemoMode}
          onCreateLorebook={({ form, offer, meter }) => {
            const canAny = Boolean(meter.tierOffer?.canCreateAny) || isDemoMode;
            if (!canAny) return;
            const selected =
              form ?? meter.tierOffer?.highestUnlocked ?? (isDemoMode ? 'vignette' : undefined);
            if (!selected) return;
            setLorebookPrefill({
              ...offer.prefill,
              form: selected,
              unlockedForms: meter.tierOffer?.unlocked,
            });
            setStitchedArc(null);
          }}
        />
      )}

      {/* ── LoreBook creator, prefilled from an arc or generated timeline ── */}
      {lorebookPrefill && (
        <KnowledgeBaseCreator
          prefill={lorebookPrefill}
          onClose={() => setLorebookPrefill(null)}
          onGenerated={() => {
            setLorebookPrefill(null);
            navigate(lorebookLibraryUrl());
          }}
        />
      )}
    </div>
  );
};
