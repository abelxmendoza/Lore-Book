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
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { TRACK_COLORS, TRACK_LABELS, type LifeArc, type ArcTrack } from '../../hooks/useLifeArcs';
import type { ChronologyEntry } from '../../types/timelineV2';
import type { StoryChapter } from '../../api/storyChapters';
import type { LifeEraRecord } from '../../api/lifeEras';
import { StoryArcBadge, getSourceEventCount } from './StoryArcBadge';
import { TimelineStitchedView } from './TimelineStitchedView';
import { TimelineMonthBanner } from './TimelineDateDisplay';
import { StoryChapterReader, StoryChaptersPanel } from '../narrative/StoryChaptersPanel';
import { LifeEraReader, LifeErasPanel } from '../narrative/LifeErasPanel';

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

/** Prefer arc membership (source_event_ids); fall back to date-window overlap. */
function chapterItemCount(arc: LifeArc, entries: ChronologyEntry[]): number {
  const fromMeta = getSourceEventCount(arc);
  if (fromMeta != null) return fromMeta;
  return entriesForArc(arc, entries).length;
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
      className={`w-full text-left px-3 sm:px-4 py-3 border-b border-white/5 transition-all group touch-manipulation ${
        selected
          ? 'bg-primary/10 border-l-2 border-l-primary sm:bg-white/8'
          : 'hover:bg-white/4 border-l-2 border-l-transparent active:bg-white/6'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${c.dotBg}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${selected ? 'text-white' : 'text-white/75 group-hover:text-white/90'}`}>
            {arc.title}
          </p>
          <p className="text-[11px] mt-1">
            <span className="inline-flex items-center rounded-md border border-primary/40 bg-primary/15 px-2 py-0.5 font-mono font-bold text-white text-[10px] sm:text-[11px] shadow-[0_0_10px_rgba(99,102,241,0.2)]">
              {formatDateRange(arc)}
            </span>
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${c.bg} ${c.text}`}>{TRACK_LABELS[track]}</span>
            <StoryArcBadge arc={arc} variant="compact" />
            {entryCount > 0 && (
              <span className="text-[10px] text-white/25">{entryCount} mem.</span>
            )}
            {arc.is_active && (
              <span className="text-[10px] text-emerald-400/80">● active</span>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-white/20 shrink-0 mt-1 sm:hidden" />
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
              <StoryArcBadge arc={arc} variant="full" />
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
            <TimelineMonthBanner label={formatDateRange(arc)} sublabel={arc.is_active ? 'Ongoing chapter' : 'Chapter span'} />
            {getSourceEventCount(arc) != null && (
              <p className="text-[11px] text-white/30 mt-1">
                {getSourceEventCount(arc)} linked moment{getSourceEventCount(arc) === 1 ? '' : 's'}
              </p>
            )}
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
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStoryChapter, setSelectedStoryChapter] = useState<StoryChapter | null>(null);
  const [selectedLifeEra, setSelectedLifeEra] = useState<LifeEraRecord | null>(null);
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

  const selectedArc =
    selectedStoryChapter || selectedLifeEra
      ? null
      : sortedArcs.find(a => a.id === selectedId) ?? sortedArcs[0] ?? null;

  const arcCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const arc of sortedArcs) {
      map[arc.id] = chapterItemCount(arc, entries);
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

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── Table of contents ────────────────────────────────────────── */}
      <div
        className={`w-full md:w-72 flex-shrink-0 border-r border-white/8 overflow-y-auto bg-black/50 ${
          mobileReaderOpen ? 'hidden md:block' : 'block'
        }`}
      >
        <div className="px-3 sm:px-4 py-3 border-b border-white/8 sticky top-0 bg-black/95 backdrop-blur-sm z-10">
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-mono">
            {sortedArcs.length} life arc{sortedArcs.length !== 1 ? 's' : ''}
          </p>
          {isMobile && (
            <p className="text-xs text-white/40 mt-1">Tap a chapter to read</p>
          )}
        </div>

        <div className="p-3 border-b border-white/8 space-y-3">
          <LifeErasPanel
            compact
            selectedId={selectedLifeEra?.id ?? null}
            onSelectEra={(era) => {
              setSelectedLifeEra(era);
              setSelectedStoryChapter(null);
              setSelectedId(null);
              setMobileReaderOpen(true);
            }}
          />
          <StoryChaptersPanel
            compact
            selectedId={selectedStoryChapter?.id ?? null}
            onSelectChapter={(chapter) => {
              setSelectedStoryChapter(chapter);
              setSelectedLifeEra(null);
              setSelectedId(null);
              setMobileReaderOpen(true);
            }}
          />
        </div>

        {sortedArcs.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Star className="h-8 w-8 text-white/10 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No life arcs yet</p>
            <p className="text-white/25 text-xs mt-1">
              Eras and story chapters above fill in as Scenes cluster over time.
            </p>
          </div>
        ) : (
          sortedArcs.map(arc => (
            <ChapterItem
              key={arc.id}
              arc={arc}
              selected={!selectedStoryChapter && !selectedLifeEra && arc.id === (selectedArc?.id)}
              entryCount={arcCountMap[arc.id] ?? 0}
              onClick={() => {
                setSelectedStoryChapter(null);
                setSelectedLifeEra(null);
                setSelectedId(arc.id);
                setMobileReaderOpen(true);
              }}
            />
          ))
        )}
      </div>

      {/* ── Reading area ─────────────────────────────────────────────── */}
      <div
        className={`flex-1 min-w-0 overflow-hidden bg-black ${
          mobileReaderOpen ? 'block' : 'hidden md:block'
        }`}
      >
        {selectedLifeEra ? (
          <LifeEraReader
            era={selectedLifeEra}
            onBack={() => {
              setSelectedLifeEra(null);
              setMobileReaderOpen(false);
            }}
          />
        ) : selectedStoryChapter ? (
          <StoryChapterReader
            chapter={selectedStoryChapter}
            onBack={() => {
              setSelectedStoryChapter(null);
              setMobileReaderOpen(false);
            }}
          />
        ) : selectedArc ? (
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
