/**
 * OmniTimeline — clean shell replacing OmniTimelinePanel.
 * Fetches arc + chronology data once, routes between three views.
 */

import { useState, useMemo, useEffect } from 'react';
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

type View = OmniTimelineView;

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
  const [genSearchOpen, setGenSearchOpen] = useState(Boolean(urlQuery.trim()));

  const { user }                     = useAuth();
  const { isGuest }                  = useGuest();
  const { useMockData: mockEnabled } = useMockData();
  const { openMemory }               = useEntityModal();
  const isDemoMode = !user && (isGuest ? mockEnabled : mockEnabled);

  const { arcs, activeArcs, arcsByTrack, loading: arcsLoading } = useLifeArcs();
  const { entries, loading: entriesLoading } = useChronology();

  // Birth-year-anchored life eras (Childhood / Twenties / …). These are the
  // `lifestage-*` chapter candidates produced server-side from resolved event
  // times; surfaced here as a compact "Life Chapters" overview strip. RTK Query
  // dedupes with the LoreKeeper context's chapters fetch, so this is ~free.
  const { data: chaptersData } = useGetChaptersQuery(undefined, { skip: isDemoMode });
  const lifeEras = useMemo(
    () => (chaptersData?.candidates ?? []).filter((c) => c.id.startsWith('lifestage-')),
    [chaptersData],
  );

  const loading = arcsLoading || entriesLoading;

  const statsLabel = useMemo(() => {
    if (isDemoMode) return 'Demo';
    if (arcs.length > 0) return `${arcs.length} · ${entries.length}`;
    if (entries.length > 0) return `${entries.length}`;
    return null;
  }, [isDemoMode, arcs.length, entries.length]);

  const genTerms = genQuery.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const generatedEvents = useMemo(() => {
    if (!genQuery.trim()) return [];
    return [...entries]
      .filter((e) => {
        if (genTerms.length === 0) return true;
        const hay = `${e.content ?? ''} ${(e.timeline_names ?? []).join(' ')}`.toLowerCase();
        return genTerms.some((t) => hay.includes(t));
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [genQuery, entries, genTerms]);

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

  const submitGenSearch = () => {
    setGenQuery(genInput.trim());
    if (isMobile) setGenSearchOpen(false);
  };

  const clearGenSearch = () => {
    setGenQuery('');
    setGenInput('');
  };

  const renderContent = () => {
    if (genQuery) {
      return (
        <div className="h-full overflow-y-auto px-3 sm:px-6 py-4 sm:py-5">
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 mb-3">
              <h2 className="text-base sm:text-xl font-semibold text-white break-words">{genQuery}</h2>
              <span className="text-xs text-white/40 shrink-0">
                {generatedEvents.length} moment{generatedEvents.length !== 1 ? 's' : ''}
              </span>
            </div>
            {matchingArcs.length > 0 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap mb-4 pb-1">
                {matchingArcs.slice(0, 6).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setStitchedArc(a)}
                    className="shrink-0 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-xs text-primary hover:bg-primary/20"
                  >
                    {a.title}
                  </button>
                ))}
              </div>
            )}
            {loading ? (
              <p className="text-sm text-white/40 py-10 text-center">Building timeline…</p>
            ) : generatedEvents.length === 0 ? (
              <p className="text-sm text-white/40 py-10 text-center px-4">
                No moments match “{genQuery}”. Try a person, place, era, or theme.
              </p>
            ) : (
              <ol className="space-y-3 sm:space-y-0 sm:relative sm:border-l sm:border-white/10 sm:ml-2">
                {generatedEvents.map((e) => (
                  <li
                    key={e.id}
                    className="sm:ml-4 sm:pb-5 rounded-xl sm:rounded-none border border-white/8 sm:border-0 bg-white/[0.03] sm:bg-transparent p-3 sm:p-0"
                  >
                    <div className="hidden sm:block absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary/70 border border-black" />
                    <div className="text-[11px] uppercase tracking-wide text-white/40">
                      {e.start_time
                        ? new Date(e.start_time).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : 'Undated'}
                      {e.timeline_names?.length ? ` · ${e.timeline_names.join(', ')}` : ''}
                    </div>
                    <button type="button" onClick={() => openMemory(e)} className="text-left mt-1 w-full touch-manipulation">
                      <p className="text-sm text-white/90 line-clamp-4 sm:line-clamp-3 hover:text-white leading-relaxed">
                        {e.content}
                      </p>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      );
    }

    switch (view) {
      case 'swimlanes':
        return (
          <TimelineSwimlanes
            arcs={arcs}
            arcsByTrack={arcsByTrack}
            activeArcs={activeArcs}
            entries={entries}
            loading={loading}
            onOpenArcTimeline={setStitchedArc}
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
            entries={entries}
            loading={loading}
            onOpenArcTimeline={setStitchedArc}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-black" data-testid="omni-timeline">
      {/* ── Mobile header ──────────────────────────────────────────────── */}
      {isMobile ? (
        <header
          className="flex-shrink-0 border-b border-white/8 bg-black/95 backdrop-blur-md px-3 py-2.5"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-2.5">
            {onOpenAppSidebar && (
              <button
                type="button"
                onClick={onOpenAppSidebar}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-white/60 active:bg-white/10"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-white truncate">Timeline</h1>
                {statsLabel && (
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      isDemoMode
                        ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                        : 'bg-white/8 border border-white/10 text-white/45'
                    }`}
                  >
                    {isDemoMode && <Sparkles className="inline h-2.5 w-2.5 mr-0.5 -mt-px" />}
                    {statsLabel}
                  </span>
                )}
              </div>
              {genQuery && (
                <p className="text-[11px] text-primary/80 truncate mt-0.5">Showing: {genQuery}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (genQuery && !genSearchOpen) {
                  clearGenSearch();
                } else {
                  setGenSearchOpen(v => !v);
                }
              }}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                genSearchOpen || genQuery
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-white/10 text-white/50 active:bg-white/10'
              }`}
              aria-label={genSearchOpen ? 'Close search' : 'Generate a timeline'}
            >
              {genSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </button>
          </div>

          {/* Active arcs — compact strip under header on swimlanes view */}
          {!loading && !genQuery && view === 'swimlanes' && activeArcs.length > 0 && (
            <div className="mt-2 -mx-3 px-3 flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
              {activeArcs.slice(0, 5).map(arc => (
                <button
                  key={arc.id}
                  type="button"
                  onClick={() => setStitchedArc(arc)}
                  className="shrink-0 max-w-[9rem] truncate px-2.5 py-1 rounded-full border border-primary/25 bg-primary/10 text-[11px] text-primary/90 active:bg-primary/20"
                >
                  {arc.title}
                </button>
              ))}
            </div>
          )}
        </header>
      ) : (
        /* ── Desktop header ───────────────────────────────────────────── */
        <header
          className="flex-shrink-0 border-b border-white/8 bg-black/90 backdrop-blur-sm px-6 py-3"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <ChatFirstViewHint />

          <div className="flex flex-row items-center justify-between gap-4 mt-1">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold text-white leading-none">Timeline</h1>
                {isDemoMode && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                    <Sparkles className="h-2.5 w-2.5" />
                    Demo
                  </span>
                )}
              </div>
              <p className="text-xs text-white/35 mt-0.5">
                {arcs.length > 0
                  ? `${arcs.length} arc${arcs.length !== 1 ? 's' : ''} · ${entries.length} memories`
                  : entries.length > 0
                  ? `${entries.length} memories`
                  : 'Your life story builds here'}
              </p>
            </div>

            <div
              className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-xl p-1"
              role="tablist"
              aria-label="Timeline views"
            >
              {VIEWS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  onClick={() => setView(id)}
                  title={VIEWS.find(v => v.id === id)?.desc}
                  aria-selected={view === id}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    view === id
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-white/50 hover:text-white hover:bg-white/8'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); submitGenSearch(); }}
            className="mt-3 flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
              <input
                value={genInput}
                onChange={(e) => setGenInput(e.target.value)}
                placeholder='Generate a timeline… e.g. "my nightlife", "everything with Sol", "2024 career"'
                aria-label="Generate a timeline"
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-primary/50 focus:bg-white/8 transition-colors"
              />
            </div>
            <button type="submit" className="shrink-0 px-3.5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
              Generate
            </button>
            {genQuery && (
              <button
                type="button"
                onClick={clearGenSearch}
                className="shrink-0 px-2.5 py-2 rounded-lg border border-white/10 text-white/60 text-sm hover:bg-white/5 transition-colors"
              >
                Clear
              </button>
            )}
          </form>

          {!loading && activeArcs.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/6">
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-mono mb-2">Active now</p>
              <div className="flex flex-wrap gap-2">
                {activeArcs.slice(0, 4).map(arc => (
                  <button
                    key={arc.id}
                    type="button"
                    onClick={() => setStitchedArc(arc)}
                    className="truncate px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-[11px] text-white/70 hover:bg-white/10 transition-colors"
                    title={arc.summary ?? arc.title}
                  >
                    {arc.title}
                  </button>
                ))}
                {activeArcs.length > 4 && (
                  <span className="text-[11px] text-white/30 self-center">+{activeArcs.length - 4} more</span>
                )}
              </div>
            </div>
          )}
        </header>
      )}

      {/* ── Mobile search overlay ──────────────────────────────────────── */}
      {isMobile && genSearchOpen && (
        <div className="flex-shrink-0 border-b border-white/8 bg-[#111] px-3 py-3 animate-in slide-in-from-top-2 duration-200">
          <form
            onSubmit={(e) => { e.preventDefault(); submitGenSearch(); }}
            className="flex flex-col gap-2"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
              <input
                autoFocus
                value={genInput}
                onChange={(e) => setGenInput(e.target.value)}
                placeholder="Nightlife, 2024 career, everything with Sol…"
                aria-label="Generate a timeline"
                className="w-full pl-9 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-semibold active:bg-primary/90"
              >
                Generate timeline
              </button>
              {genQuery && (
                <button
                  type="button"
                  onClick={clearGenSearch}
                  className="px-4 py-3 rounded-xl border border-white/10 text-white/60 text-sm"
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* ── Life Chapters strip — birth-year-anchored life eras ──────────── */}
      {!loading && !genQuery && lifeEras.length > 0 && (
        <div className="flex-shrink-0 border-b border-white/8 bg-black/60 px-3 sm:px-6 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-white/40 shrink-0">Life Chapters</span>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {lifeEras.map((era) => {
                const startYear = new Date(era.start_date).getFullYear();
                const endYear = new Date(era.end_date).getFullYear();
                const count = era.entry_ids?.length ?? 0;
                return (
                  <div
                    key={era.id}
                    title={era.summary}
                    className="shrink-0 px-2.5 py-1 rounded-full border border-primary/25 bg-primary/10 text-[11px] text-primary/90"
                  >
                    <span className="font-medium">{era.chapter_title}</span>
                    <span className="text-white/40 ml-1">
                      {startYear === endYear ? startYear : `${startYear}–${endYear}`}
                    </span>
                    {count > 0 && <span className="text-white/30 ml-1">· {count}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden relative">{renderContent()}</div>

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
