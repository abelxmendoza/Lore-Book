/**
 * TimelineStoryView — memoir/book reading experience.
 *
 * Left:  chapter list (all life arcs sorted chronologically, color-coded by track)
 * Right: selected arc header + AI summary + filtered entries in reading order
 *
 * Feels like opening a personal autobiography: the table of contents
 * is on the left, the current chapter unfolds on the right.
 */

import { useState, useMemo, useEffect } from 'react';
import { Star, ChevronLeft } from 'lucide-react';
import { TRACK_COLORS, TRACK_LABELS, type LifeArc, type ArcTrack } from '../../hooks/useLifeArcs';
import type { ChronologyEntry } from '../../types/timelineV2';
import { TimelineStitchedView } from './TimelineStitchedView';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateRange(arc: LifeArc): string {
  const start = arc.start_date
    ? new Date(arc.start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';
  const end = arc.is_active ? 'now' : arc.end_date
    ? new Date(arc.end_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';
  return [start, end].filter(Boolean).join(' – ');
}

function entriesForArc(arc: LifeArc, entries: ChronologyEntry[]): ChronologyEntry[] {
  if (!arc.start_date) return [];
  const s = new Date(arc.start_date).getTime();
  const e = arc.end_date ? new Date(arc.end_date).getTime() : Date.now();
  return entries
    .filter(en => {
      const t = new Date(en.start_time).getTime();
      return t >= s && t <= e;
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
}

function confidenceBars(confidence: number): string {
  const filled = Math.round(confidence * 4);
  return '█'.repeat(filled) + '░'.repeat(4 - filled);
}

// ─── Chapter list item ────────────────────────────────────────────────────────

const ChapterItem = ({
  arc,
  selected,
  entryCount,
  onClick,
}: {
  arc: LifeArc;
  selected: boolean;
  entryCount: number;
  onClick: () => void;
}) => {
  const track = (arc.track ?? 'inner') as ArcTrack;
  const c     = TRACK_COLORS[track];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-white/5 transition-all group ${
        selected
          ? 'bg-white/8 border-l-2 ' + c.border
          : 'hover:bg-white/4 border-l-2 border-transparent'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${c.dotBg}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug truncate ${selected ? 'text-white' : 'text-white/70 group-hover:text-white/90'}`}>
            {arc.title}
          </p>
          <p className="text-[11px] text-white/30 mt-0.5">{formatDateRange(arc)}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] ${c.text}`}>{TRACK_LABELS[track]}</span>
            {entryCount > 0 && (
              <span className="text-[10px] text-white/20">{entryCount} memor{entryCount === 1 ? 'y' : 'ies'}</span>
            )}
            {arc.is_active && (
              <span className="text-[10px] text-emerald-400/80">● active</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
};

// ─── Arc reading panel ────────────────────────────────────────────────────────

const ArcPanel = ({
  arc,
  onBack,
}: {
  arc: LifeArc;
  onBack?: () => void;
}) => {
  const track = (arc.track ?? 'inner') as ArcTrack;
  const c     = TRACK_COLORS[track];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Chapter header */}
      <div className={`sticky top-0 z-10 px-4 sm:px-8 py-4 sm:py-6 border-b border-white/8 bg-black/95 backdrop-blur-sm`}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="md:hidden flex items-center gap-1.5 text-xs text-white/50 hover:text-white mb-3 -ml-1 min-h-[44px]"
          >
            <ChevronLeft className="h-4 w-4" />
            Chapters
          </button>
        )}
        <div className="flex items-start gap-3">
          <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1.5 ${c.dotBg}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${c.bg} ${c.border} ${c.text}`}>
                {TRACK_LABELS[track]}
              </span>
              {arc.dominant_emotion && (
                <span className="text-xs text-white/30">{arc.dominant_emotion}</span>
              )}
              <span className="text-xs text-white/20 font-mono" title="Confidence">
                {confidenceBars(arc.confidence)}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight mb-1" style={{ fontFamily: 'Georgia, serif' }}>
              {arc.title}
            </h2>
            <p className="text-xs text-white/35">{formatDateRange(arc)}</p>
          </div>
          {arc.is_active && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 rounded-full shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Ongoing
            </span>
          )}
        </div>

        {arc.summary && (
          <p className="text-sm text-white/55 leading-relaxed mt-4 pl-0 sm:pl-6 border-l-0 sm:border-l-2 border-white/10">
            {arc.summary}
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 border-t border-white/8">
        <TimelineStitchedView
          embedded
          hideHeader
          lifeArcId={arc.id}
          scopeLabel={arc.title}
        />
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

interface TimelineStoryViewProps {
  arcs: LifeArc[];
  entries: ChronologyEntry[];
  loading: boolean;
  onOpenArcTimeline?: (arc: LifeArc) => void;
}

export const TimelineStoryView = ({ arcs, entries, loading }: TimelineStoryViewProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileReaderOpen, setMobileReaderOpen] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const onChange = () => {
      if (mql.matches) setMobileReaderOpen(false);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Sort arcs by start_date, fallback to created_at
  const sortedArcs = useMemo(() =>
    [...arcs].sort((a, b) => {
      const da = a.start_date ? new Date(a.start_date).getTime() : 0;
      const db = b.start_date ? new Date(b.start_date).getTime() : 0;
      return da - db;
    }),
  [arcs]);

  const selectedArc = sortedArcs.find(a => a.id === selectedId) ?? sortedArcs[0] ?? null;

  const arcEntryMap = useMemo(() => {
    const map: Record<string, ChronologyEntry[]> = {};
    for (const arc of sortedArcs) {
      map[arc.id] = entriesForArc(arc, entries);
    }
    return map;
  }, [sortedArcs, entries]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="space-y-3 w-72">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/6 bg-white/3 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-white/20" />
              <div className="flex-1">
                <div className="h-3 bg-white/15 rounded w-3/4 mb-1.5" />
                <div className="h-2 bg-white/8 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (sortedArcs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
        <Star className="h-10 w-10 text-white/10" />
        <div>
          <p className="text-white/50 font-medium">No chapters yet</p>
          <p className="text-white/25 text-sm mt-1 max-w-xs">
            Your life arcs will appear here once LoreBook detects recurring patterns in your memories.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── Table of contents ────────────────────────────────────────── */}
      <div
        className={`w-full md:w-64 flex-shrink-0 border-r border-white/8 overflow-y-auto bg-black/50 ${
          mobileReaderOpen ? 'hidden md:block' : 'block'
        }`}
      >
        <div className="px-4 py-3 border-b border-white/8 sticky top-0 bg-black/90 backdrop-blur-sm z-10">
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-mono text-center md:text-left">
            {sortedArcs.length} chapter{sortedArcs.length !== 1 ? 's' : ''}
          </p>
        </div>

        {sortedArcs.map(arc => (
          <ChapterItem
            key={arc.id}
            arc={arc}
            selected={arc.id === (selectedArc?.id)}
            entryCount={arcEntryMap[arc.id]?.length ?? 0}
            onClick={() => {
              setSelectedId(arc.id);
              setMobileReaderOpen(true);
            }}
          />
        ))}
      </div>

      {/* ── Reading area ─────────────────────────────────────────────── */}
      <div
        className={`flex-1 min-w-0 overflow-hidden bg-black ${
          mobileReaderOpen ? 'block' : 'hidden md:block'
        }`}
      >
        {selectedArc ? (
          <ArcPanel
            arc={selectedArc}
            onBack={() => setMobileReaderOpen(false)}
          />
        ) : (
          <div className="h-full flex items-center justify-center px-6">
            <p className="text-white/25 text-sm text-center">Select a chapter to start reading.</p>
          </div>
        )}
      </div>
    </div>
  );
};
