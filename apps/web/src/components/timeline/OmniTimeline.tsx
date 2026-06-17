/**
 * OmniTimeline — clean shell replacing OmniTimelinePanel.
 * Fetches arc + chronology data once, routes between three views.
 */

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutTemplate, BookOpen, Search, Sparkles, Menu, CalendarDays, Calendar } from 'lucide-react';
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
import { TimelineSearch } from '../search/TimelineSearch';
import type { LifeArc } from '../../hooks/useLifeArcs';

type View = 'swimlanes' | 'events' | 'story' | 'search' | 'calendar';

const VIEWS: { id: View; label: string; shortLabel: string; Icon: React.ElementType; desc: string }[] = [
  { id: 'swimlanes', label: 'Swimlanes', shortLabel: 'Lanes', Icon: LayoutTemplate, desc: 'Your life across parallel tracks in calendar time' },
  { id: 'events',    label: 'Events',    shortLabel: 'Events', Icon: CalendarDays,  desc: 'Moments and events stitched chronologically — drag to reorder' },
  { id: 'calendar',  label: 'Calendar',  shortLabel: 'Cal',   Icon: Calendar,      desc: 'Named occasions and events by day' },
  { id: 'story',     label: 'Story',     shortLabel: 'Story', Icon: BookOpen,       desc: 'Arc-by-arc narrative reading view' },
  { id: 'search',    label: 'Search',    shortLabel: 'Find',  Icon: Search,         desc: 'Find any memory or arc' },
];

type OmniTimelineProps = {
  onOpenAppSidebar?: () => void;
};

export const OmniTimeline = ({ onOpenAppSidebar }: OmniTimelineProps) => {
  const [searchParams] = useSearchParams();
  const urlView = searchParams.get('view');
  const urlQuery = searchParams.get('q') ?? '';
  const initialView = useMemo<View>(() => (urlView === 'search' ? 'search' : 'swimlanes'), [urlView]);
  const [view, setView] = useState<View>(initialView);

  useEffect(() => {
    if (urlView === 'search') setView('search');
  }, [urlView]);
  const [stitchedArc, setStitchedArc] = useState<LifeArc | null>(null);

  const { user }                     = useAuth();
  const { isGuest }                  = useGuest();
  const { useMockData: mockEnabled } = useMockData();
  const { openMemory }               = useEntityModal();
  const isDemoMode = !user && (isGuest ? mockEnabled : mockEnabled);

  const { arcs, activeArcs, arcsByTrack, loading: arcsLoading } = useLifeArcs();
  const { entries, loading: entriesLoading } = useChronology();

  const loading = arcsLoading || entriesLoading;


  return (
    <div className="flex flex-col h-full min-h-0 bg-black" data-testid="omni-timeline">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 border-b border-white/8 bg-black/90 backdrop-blur-sm px-3 sm:px-6 py-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <ChatFirstViewHint />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mt-1">
          {/* Title row */}
          <div className="flex items-start gap-3 min-w-0">
            {onOpenAppSidebar && (
              <button
                type="button"
                onClick={onOpenAppSidebar}
                className="lg:hidden mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/8 transition-colors"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold text-white leading-none">Timeline</h1>
                {isDemoMode && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                    <Sparkles className="h-2.5 w-2.5" />
                    Demo
                  </span>
                )}
              </div>
              <p className="text-xs text-white/35 mt-0.5 truncate">
                {isDemoMode
                  ? 'Sample data — sign up to build your real timeline'
                  : arcs.length > 0
                  ? `${arcs.length} arc${arcs.length !== 1 ? 's' : ''} · ${entries.length} memories`
                  : entries.length > 0
                  ? `${entries.length} memories`
                  : 'Your life story builds here'}
              </p>
            </div>
          </div>

          {/* View switcher — centered on mobile */}
          <div className="flex items-center justify-center sm:justify-end w-full sm:w-auto">
            <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-xl p-1 w-full sm:w-auto max-w-md sm:max-w-none">
              {VIEWS.map(({ id, label, shortLabel, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  title={VIEWS.find(v => v.id === id)?.desc}
                  aria-label={label}
                  aria-pressed={view === id}
                  className={`flex flex-1 sm:flex-none items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium transition-all min-h-[40px] sm:min-h-0 ${
                    view === id
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-white/50 hover:text-white hover:bg-white/8'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="sm:hidden">{shortLabel}</span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active arcs — compact chips on mobile */}
        {!loading && activeArcs.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/6">
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-mono mb-2 text-center sm:text-left">
              Active now
            </p>
            <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 sm:gap-2">
              {activeArcs.slice(0, 4).map(arc => (
                <button
                  key={arc.id}
                  type="button"
                  onClick={() => setStitchedArc(arc)}
                  className="max-w-[11rem] sm:max-w-none truncate px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-[11px] text-white/70 hover:bg-white/10 transition-colors"
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
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {view === 'swimlanes' && (
          <TimelineSwimlanes
            arcs={arcs}
            arcsByTrack={arcsByTrack}
            activeArcs={activeArcs}
            entries={entries}
            loading={loading}
            onOpenArcTimeline={setStitchedArc}
          />
        )}
        {view === 'events' && (
          <TimelineStitchedView embedded />
        )}
        {view === 'calendar' && (
          <TimelineCalendarView />
        )}
        {view === 'story' && (
          <TimelineStoryView
            arcs={arcs}
            entries={entries}
            loading={loading}
            onOpenArcTimeline={setStitchedArc}
          />
        )}
        {view === 'search' && (
          <div className="h-full overflow-y-auto pt-6 sm:pt-10 px-3 sm:px-4 pb-8">
            <div className="w-full max-w-3xl mx-auto">
              <div className="mb-4">
                <h2 className="text-xl sm:text-2xl font-semibold text-white">Universal Timeline Search</h2>
                <p className="text-xs sm:text-sm text-white/60 mt-1">
                  Search across people, places, skills, jobs, projects, eras, and more — open any one to render its timeline chronologically.
                </p>
              </div>
              <TimelineSearch initialQuery={urlQuery} />
            </div>
          </div>
        )}
      </div>

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
