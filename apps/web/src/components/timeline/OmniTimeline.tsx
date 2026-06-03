/**
 * OmniTimeline — clean shell replacing OmniTimelinePanel.
 * Fetches arc + chronology data once, routes between three views.
 */

import { useState } from 'react';
import { LayoutTemplate, BookOpen, Search, Sparkles } from 'lucide-react';
import { useLifeArcs } from '../../hooks/useLifeArcs';
import { useChronology } from '../../hooks/useChronology';
import { useMockData } from '../../contexts/MockDataContext';
import { useAuth } from '../../lib/supabase';
import { useGuest } from '../../contexts/GuestContext';
import { ChatFirstViewHint } from '../ChatFirstViewHint';
import { TimelineSwimlanes } from './TimelineSwimlanes';
import { TimelineStoryView } from './TimelineStoryView';

type View = 'swimlanes' | 'story' | 'search';

const VIEWS: { id: View; label: string; Icon: React.ElementType; desc: string }[] = [
  { id: 'swimlanes', label: 'Swimlanes', Icon: LayoutTemplate, desc: 'Your life across parallel tracks in calendar time' },
  { id: 'story',     label: 'Story',     Icon: BookOpen,       desc: 'Arc-by-arc narrative reading view' },
  { id: 'search',    label: 'Search',    Icon: Search,         desc: 'Find any memory or arc' },
];

export const OmniTimeline = () => {
  const [view, setView] = useState<View>('swimlanes');
  const [searchQuery, setSearchQuery] = useState('');

  const { user }                     = useAuth();
  const { isGuest }                  = useGuest();
  const { useMockData: mockEnabled } = useMockData();
  const isDemoMode = !user && (isGuest ? mockEnabled : mockEnabled);

  const { arcs, activeArcs, arcsByTrack, loading: arcsLoading } = useLifeArcs();
  const { entries, loading: entriesLoading } = useChronology();

  const loading = arcsLoading || entriesLoading;

  return (
    <div className="flex flex-col h-full bg-black" data-testid="omni-timeline">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-white/8 bg-black/80 backdrop-blur-sm px-4 sm:px-6 py-3">
        <ChatFirstViewHint />

        <div className="flex items-center justify-between gap-4 mt-1">
          {/* Title */}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-white leading-none">Timeline</h1>
              {isDemoMode && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                  <Sparkles className="h-2.5 w-2.5" />
                  Demo
                </span>
              )}
            </div>
            <p className="text-xs text-white/35 mt-0.5">
              {isDemoMode
                ? 'Sample data — sign up to build your real timeline'
                : arcs.length > 0
                ? `${arcs.length} arc${arcs.length !== 1 ? 's' : ''} · ${entries.length} memories`
                : entries.length > 0
                ? `${entries.length} memories`
                : 'Your life story builds here'}
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-xl p-1">
            {VIEWS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                title={VIEWS.find(v => v.id === id)?.desc}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  view === id
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-white/50 hover:text-white hover:bg-white/8'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
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
          />
        )}
        {view === 'story' && (
          <TimelineStoryView
            arcs={arcs}
            entries={entries}
            loading={loading}
          />
        )}
        {view === 'search' && (
          <div className="h-full flex flex-col items-center justify-start pt-16 px-4">
            <div className="w-full max-w-2xl">
              <div className="relative mb-8">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/30 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search memories, arcs, people, places…"
                  autoFocus
                  className="w-full h-14 pl-12 pr-4 rounded-2xl bg-white/5 border border-white/10 text-white text-base placeholder:text-white/25 focus:outline-none focus:border-primary/50 focus:bg-white/8 transition-all"
                />
              </div>
              {searchQuery.length < 2 ? (
                <div className="space-y-2">
                  <p className="text-xs text-white/30 uppercase tracking-widest font-mono mb-3">Recent arcs</p>
                  {arcs.slice(0, 6).map(arc => (
                    <button
                      key={arc.id}
                      type="button"
                      onClick={() => { setView('story'); }}
                      className="w-full text-left px-4 py-3 rounded-xl border border-white/8 bg-white/3 hover:bg-white/6 transition-colors"
                    >
                      <p className="text-sm text-white font-medium">{arc.title}</p>
                      <p className="text-xs text-white/40 mt-0.5">
                        {arc.track ?? arc.arc_type} · {arc.start_date?.slice(0, 4)}{arc.end_date ? ` – ${arc.end_date.slice(0, 4)}` : ' – now'}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {entries
                    .filter(e => e.content.toLowerCase().includes(searchQuery.toLowerCase()))
                    .slice(0, 20)
                    .map(entry => (
                      <div key={entry.id} className="px-4 py-3 rounded-xl border border-white/8 bg-white/3">
                        <p className="text-xs text-white/40 mb-1">
                          {new Date(entry.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        <p className="text-sm text-white/80 line-clamp-2">{entry.content}</p>
                      </div>
                    ))}
                  {entries.filter(e => e.content.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                    <p className="text-center text-white/30 text-sm pt-8">No memories match "{searchQuery}"</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
