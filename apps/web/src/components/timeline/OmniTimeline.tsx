/**
 * OmniTimeline — clean shell replacing OmniTimelinePanel.
 * Fetches arc + chronology data once, routes between three views.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutTemplate, BookOpen, Search, Sparkles, Menu, CalendarDays, Calendar, X } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useLifeArcs } from '../../hooks/useLifeArcs';
import { useChronology } from '../../hooks/useChronology';
import { useMockData } from '../../contexts/MockDataContext';
import { useAuth } from '../../lib/supabase';
import { useGuest } from '../../contexts/GuestContext';
import { useEntityModal } from '../../contexts/EntityModalContext';
import { ChatFirstViewHint } from '../ChatFirstViewHint';
import { TimelineSwimlanes } from './TimelineSwimlanes';
import { TimelineStoryView } from './TimelineStoryView';
import { TimelineStitchedView } from './TimelineStitchedView';
import { TimelineCalendarView } from './TimelineCalendarView';
import { OmniTimelineBottomNav, type OmniTimelineView } from './OmniTimelineBottomNav';
import { useGetChaptersQuery } from '../../store/api/loreApi';
import type { LifeArc } from '../../hooks/useLifeArcs';
import { TimelineGeneratingSimulation } from './TimelineGeneratingSimulation';
import { GeneratedTimelineReveal, type GeneratedTimelineEvent } from './GeneratedTimelineReveal';
import { GeneratedTimelineLibraryPanel } from './GeneratedTimelineLibraryPanel';
import { buildMockGeneratedTimeline } from '../../mocks/timelineGenerationMock';
import { DEMO_GENERATED_TIMELINE_SEEDS } from '../../mocks/stitchedTimelineMock';
import { useGeneratedTimelinesLibrary } from '../../hooks/useGeneratedTimelinesLibrary';
import type { SavedGeneratedTimeline } from '../../lib/generatedTimelinesLibrary';
import { OmniTimelineErrorBanner } from './OmniTimelineErrorBanner';
import { UniversalTimelineSearch } from './UniversalTimelineSearch';
import './OmniTimeline.css';

type View = OmniTimelineView;
type GenPhase = 'idle' | 'generating' | 'revealed';

const VIEWS: { id: View; label: string; shortLabel: string; Icon: React.ElementType; desc: string }[] = [
  { id: 'swimlanes', label: 'Swimlanes', shortLabel: 'Lanes', Icon: LayoutTemplate, desc: 'Your life across parallel tracks in calendar time' },
  { id: 'events',    label: 'Events',    shortLabel: 'Events', Icon: CalendarDays,  desc: 'Moments and events stitched chronologically — drag to reorder' },
  { id: 'calendar',  label: 'Calendar',  shortLabel: 'Calendar', Icon: Calendar,  desc: 'Named occasions and events by day' },
  { id: 'story',     label: 'Story',     shortLabel: 'Story', Icon: BookOpen,       desc: 'Arc-by-arc narrative reading view' },
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

export const OmniTimeline = ({ onOpenAppSidebar }: OmniTimelineProps) => {
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';
  const isMobile = useIsMobile();
  const [view, setView] = useState<View>('swimlanes');
  const [stitchedArc, setStitchedArc] = useState<LifeArc | null>(null);

  const [genInput, setGenInput] = useState(urlQuery);
  const [genQuery, setGenQuery] = useState(urlQuery);
  const [genPhase, setGenPhase] = useState<GenPhase>(urlQuery.trim() ? 'revealed' : 'idle');
  const [genSearchOpen, setGenSearchOpen] = useState(Boolean(urlQuery.trim()));
  const [activeTimelineId, setActiveTimelineId] = useState<string | null>(null);
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
  const isDemoMode = !user && (isGuest ? mockEnabled : mockEnabled);

  const { arcs, activeArcs, arcsByTrack, loading: arcsLoading, error: arcsError, refresh: refreshArcs } = useLifeArcs();
  const { entries, loading: entriesLoading, error: chronologyError, refetch: refetchChronology } = useChronology();

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
    return arcsError ?? chronologyError?.message ?? null;
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
    if (urlQuery.trim()) setGenSearchOpen(true);
  }, [urlQuery]);

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

      const terms = query.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 2);
      const matched = [...entries]
        .filter((e) => {
          if (terms.length === 0) return true;
          const hay = `${e.content ?? ''} ${(e.timeline_names ?? []).join(' ')}`.toLowerCase();
          return terms.some((t) => hay.includes(t));
        })
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      if (matched.length > 0) return { events: matched, isMock: false };
      return { events: buildMockGeneratedTimeline(query), isMock: true };
    },
    [entries, isDemoMode]
  );

  const openSavedTimeline = useCallback((saved: SavedGeneratedTimeline) => {
    setGenInput(saved.query);
    setGenQuery(saved.query);
    setActiveTimelineId(saved.id);
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
    shouldPersistRef.current = true;
    setGenPhase(options?.instant ? 'revealed' : 'generating');
    if (isMobile) setGenSearchOpen(false);
  }, [findByQuery, openSavedTimeline, isMobile]);

  const handleOpenArcTimeline = useCallback((arc: LifeArc) => {
    if (isDemoMode) {
      generateFor(arc.title, { instant: true });
      return;
    }
    setStitchedArc(arc);
  }, [isDemoMode, generateFor]);

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

  const closeGeneratedTimeline = () => {
    setGenQuery('');
    setGenInput('');
    setGenPhase('idle');
    setActiveTimelineId(null);
  };

  const handleGenComplete = useCallback(() => {
    setGenPhase('revealed');
  }, []);

  const activeSaved = useMemo(() => {
    if (activeTimelineId) return getById(activeTimelineId);
    if (genQuery.trim()) return findByQuery(genQuery);
    return undefined;
  }, [activeTimelineId, genQuery, getById, findByQuery]);

  const revealEvents = useMemo((): {
    events: GeneratedTimelineEvent[];
    isMock: boolean;
    fromLibrary: boolean;
    savedAt?: string;
    collapsed: boolean;
  } => {
    if (!genQuery.trim()) {
      return { events: [], isMock: false, fromLibrary: false, collapsed: false };
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
      };
    }

    const fresh = computeFreshReveal(genQuery);
    return { ...fresh, fromLibrary: false, collapsed: false };
  }, [genQuery, genPhase, activeSaved, computeFreshReveal, isDemoMode]);

  useEffect(() => {
    if (genPhase !== 'revealed' || !genQuery.trim() || !shouldPersistRef.current) return;
    shouldPersistRef.current = false;
    const fresh = computeFreshReveal(genQuery);
    const saved = saveTimeline({
      query: genQuery,
      events: fresh.events,
      isMock: fresh.isMock,
      arcTitles: matchingArcs.map((a) => a.title),
      existingId: activeTimelineId ?? activeSaved?.id,
      preserveCollapsed: Boolean(activeSaved?.collapsed),
    });
    if (saved?.id) setActiveTimelineId(saved.id);
  }, [genPhase, genQuery, computeFreshReveal, saveTimeline, matchingArcs, activeTimelineId, activeSaved]);

  const handleRemoveSaved = (id: string) => {
    removeTimeline(id);
    if (activeTimelineId === id) closeGeneratedTimeline();
  };

  const libraryPanel = savedTimelines.length > 0 ? (
    <GeneratedTimelineLibraryPanel
      timelines={savedTimelines}
      activeId={activeTimelineId}
      onOpen={openSavedTimeline}
      onRemove={handleRemoveSaved}
      className="omni-timeline-library my-2"
      defaultExpanded={!genQuery && savedTimelines.length <= 3}
    />
  ) : null;

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
          collapsed={revealEvents.collapsed}
          fromLibrary={revealEvents.fromLibrary}
          savedAt={revealEvents.savedAt}
          onToggleCollapse={() => {
            const id = activeTimelineId ?? activeSaved?.id;
            if (id) setTimelineCollapsed(id, !revealEvents.collapsed);
          }}
          onClose={closeGeneratedTimeline}
          onRegenerate={() => generateFor(genQuery, { forceRegenerate: true })}
          onEventClick={(e) => {
            if (!revealEvents.isMock && 'timeline_memberships' in e) {
              openMemory(e);
            }
          }}
          onArcClick={handleOpenArcTimeline}
        />
      );
    }

    switch (view) {
      case 'swimlanes':
        return (
          <TimelineSwimlanes
            arcs={arcs}
            arcsByTrack={arcsByTrack}
            activeArcs={activeArcs}
            entries={displayEntries}
            loading={loading}
            onOpenArcTimeline={handleOpenArcTimeline}
          />
        );
      case 'events':
        return <TimelineStitchedView embedded />;
      case 'calendar':
        return <TimelineCalendarView />;
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
    <div className="omni-timeline-root" data-testid="omni-timeline">
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
          <ChatFirstViewHint />

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
                {arcs.length > 0
                  ? `${arcs.length} arc${arcs.length !== 1 ? 's' : ''} · ${entries.length} memories`
                  : entries.length > 0
                  ? `${entries.length} memories`
                  : 'Your life story builds here'}
              </p>
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

        {!isMobile && (
          <UniversalTimelineSearch
            genInput={genInput}
            genQuery={genQuery}
            suggestions={TIMELINE_SUGGESTIONS}
            onInputChange={setGenInput}
            onSubmit={submitGenSearch}
            onClear={genQuery ? closeGeneratedTimeline : undefined}
            onSuggestionClick={generateFor}
            variant="desktop"
          />
        )}

        {!loading && !genQuery && activeArcs.length > 0 && (
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
            variant="mobile"
            suggestionLimit={5}
          />
        )}

      {/* ── Life Chapters strip — birth-year-anchored life eras ──────────── */}
      {!loading && !genQuery && lifeEras.length > 0 && (
        <div className="omni-timeline-life-chapters">
          <div className="flex items-center gap-2">
            <span className="omni-timeline-section-label shrink-0 mb-0">Life Chapters</span>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
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

      {/* ── Timelines library ─────────────────────────────────────────── */}
      {libraryPanel}

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
        />
      )}
    </div>
  );
};
