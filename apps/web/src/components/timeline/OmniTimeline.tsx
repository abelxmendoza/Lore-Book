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
import type { LifeArc } from '../../hooks/useLifeArcs';

type View = 'swimlanes' | 'events' | 'story' | 'calendar';

const VIEWS: { id: View; label: string; shortLabel: string; Icon: React.ElementType; desc: string }[] = [
  { id: 'swimlanes', label: 'Swimlanes', shortLabel: 'Lanes', Icon: LayoutTemplate, desc: 'Your life across parallel tracks in calendar time' },
  { id: 'events',    label: 'Events',    shortLabel: 'Events', Icon: CalendarDays,  desc: 'Moments and events stitched chronologically — drag to reorder' },
  { id: 'calendar',  label: 'Calendar',  shortLabel: 'Cal',   Icon: Calendar,      desc: 'Named occasions and events by day' },
  { id: 'story',     label: 'Story',     shortLabel: 'Story', Icon: BookOpen,       desc: 'Arc-by-arc narrative reading view' },
];

type OmniTimelineProps = {
  onOpenAppSidebar?: () => void;
};

export const OmniTimeline = ({ onOpenAppSidebar }: OmniTimelineProps) => {
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';
  const [view, setView] = useState<View>('swimlanes');
  const [stitchedArc, setStitchedArc] = useState<LifeArc | null>(null);

  // Generative timeline: type any scope ("nightlife", "everything with Sol",
  // "2024 career") and render a chronological timeline of matching moments.
  const [genInput, setGenInput] = useState(urlQuery);
  const [genQuery, setGenQuery] = useState(urlQuery);

  const { user }                     = useAuth();
  const { isGuest }                  = useGuest();
  const { useMockData: mockEnabled } = useMockData();
  const { openMemory }               = useEntityModal();
  const isDemoMode = !user && (isGuest ? mockEnabled : mockEnabled);

  const { arcs, activeArcs, arcsByTrack, loading: arcsLoading } = useLifeArcs();
  const { entries, loading: entriesLoading } = useChronology();

  const loading = arcsLoading || entriesLoading;

  // Generated chronological timeline scoped to the prompt.
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
  }, [genQuery, entries]);
  const matchingArcs = useMemo(() => {
    if (!genQuery.trim()) return [];
    return arcs.filter((a) => {
      const hay = `${a.title ?? ''} ${a.track ?? ''} ${a.arc_type ?? ''} ${a.summary ?? ''}`.toLowerCase();
      return genTerms.some((t) => hay.includes(t));
    });
  }, [genQuery, arcs]);

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

        {/* Generative timeline prompt — render a chronological timeline of anything */}
        <form
          onSubmit={(e) => { e.preventDefault(); setGenQuery(genInput.trim()); }}
          className="mt-3 flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
            <input
              value={genInput}
              onChange={(e) => setGenInput(e.target.value)}
              placeholder="Generate a timeline… e.g. “my nightlife”, “everything with Sol”, “2024 career”"
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
              onClick={() => { setGenQuery(''); setGenInput(''); }}
              className="shrink-0 px-2.5 py-2 rounded-lg border border-white/10 text-white/60 text-sm hover:bg-white/5 transition-colors"
            >
              Clear
            </button>
          )}
        </form>

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
        {/* Generated chronological timeline takes precedence over the view tabs */}
        {genQuery ? (
          <div className="h-full overflow-y-auto px-3 sm:px-6 py-5">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-baseline gap-2 mb-1">
                <h2 className="text-lg sm:text-xl font-semibold text-white">Timeline: {genQuery}</h2>
                <span className="text-xs text-white/40">{generatedEvents.length} moment{generatedEvents.length !== 1 ? 's' : ''}</span>
              </div>
              {matchingArcs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {matchingArcs.slice(0, 6).map((a) => (
                    <button key={a.id} type="button" onClick={() => setStitchedArc(a)}
                      className="px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-[11px] text-primary hover:bg-primary/20">
                      {a.title} ↗
                    </button>
                  ))}
                </div>
              )}
              {loading ? (
                <p className="text-sm text-white/40 py-10 text-center">Building timeline…</p>
              ) : generatedEvents.length === 0 ? (
                <p className="text-sm text-white/40 py-10 text-center">No moments match “{genQuery}”. Try a person, place, era, or theme.</p>
              ) : (
                <ol className="relative border-l border-white/10 ml-2">
                  {generatedEvents.map((e) => (
                    <li key={e.id} className="ml-4 pb-5">
                      <div className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary/70 border border-black" />
                      <div className="text-[11px] uppercase tracking-wide text-white/40">
                        {e.start_time ? new Date(e.start_time).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Undated'}
                        {e.timeline_names?.length ? ` · ${e.timeline_names.join(', ')}` : ''}
                      </div>
                      <button type="button" onClick={() => openMemory(e)} className="text-left mt-0.5 w-full">
                        <p className="text-sm text-white/85 line-clamp-3 hover:text-white">{e.content}</p>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        ) : (
          <>
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
          </>
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
