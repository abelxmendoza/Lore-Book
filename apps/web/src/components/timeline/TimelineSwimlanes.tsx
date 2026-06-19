/**
 * TimelineSwimlanes
 *
 * Horizontal parallel-tracks visualization:
 *   - Rows = life tracks (career, relationships, creative, health, inner)
 *   - Bars = life arcs spanning their real calendar duration
 *   - Dots = individual memories positioned by date
 *   - Vertical "NOW" line anchored to today
 *
 * Math:
 *   pixelsPerDay = BASE_PPD * zoomLevel
 *   x(date) = daysBetween(timelineStart, date) * pixelsPerDay
 *   arcWidth = daysBetween(arc.start, arc.end ?? today) * pixelsPerDay
 */

import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Calendar, ExternalLink, Layers } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MobileBottomSheet } from '../ui/MobileBottomSheet';
import { omniTimelineBottomInset } from './omniTimelineLayout';
import { TRACK_COLORS, TRACK_LABELS, type LifeArc, type ArcTrack } from '../../hooks/useLifeArcs';
import { isNarrativeConsolidationArc } from '../../lib/lifeArcLabels';
import { StoryArcBadge, storyArcTooltipSubtitle } from './StoryArcBadge';
import type { ChronologyEntry } from '../../types/timelineV2';
import { useEntityModal } from '../../contexts/EntityModalContext';
import { TimelineStitchedView } from './TimelineStitchedView';
import {
  formatEventDateCompact,
  formatEventDateShort,
  sortEntriesChronologically,
} from './timelineEventUtils';
import {
  TIMELINE_RULER_AXIS_H,
  TimelineRulerAxis,
  TimelineRulerGridline,
  TimelineRulerTick,
} from './TimelineDateDisplay';
import { buildSwimlaneAxisTicks, getMonthsBetween } from './timelineRulerTicks';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_PPD      = 3;    // pixels per day at zoom 1× (~1100px per year)
const SUBLANE_H     = 44;   // px per sub-lane within a track row
const AXIS_H        = TIMELINE_RULER_AXIS_H;
const MEM_H         = 96;   // px for labeled memory markers
const LABEL_W       = 96;   // px for the fixed track-label column (desktop)
const LABEL_W_MOBILE = 36;
const TRACK_SHORT: Record<ArcTrack, string> = {
  career: 'Work',
  relationships: 'Rel',
  creative: 'Art',
  health: 'Body',
  inner: 'Inner',
  mixed: 'Mix',
  custom: '•',
};
const ARC_BAR_H     = 28;   // px arc bar height
const ARC_BAR_VPAD  = 8;    // px above the bar inside its sub-lane
const MIN_ZOOM      = 0.3;
const MAX_ZOOM      = 8;
const TRACK_ORDER: ArcTrack[] = ['career', 'relationships', 'creative', 'health', 'inner', 'mixed'];

// ─── Sub-lane layout ─────────────────────────────────────────────────────────
//
// Overlapping arcs within the same track are stacked into separate sub-lanes
// using a greedy interval-scheduling algorithm.
//
// Sort arcs by start date, then assign each arc to the first sub-lane whose
// last arc has already ended. If all lanes are occupied, open a new one.
//
// This is O(n log n) due to the sort, O(n·lanes) for lane assignment —
// lanes is bounded by the maximum number of simultaneously-active arcs, which
// is typically 1–3 in practice.

type SubLaneMap = Map<string, number>; // arcId → sub-lane index (0-based)

function computeSubLanes(arcs: LifeArc[]): { map: SubLaneMap; count: number } {
  const sorted = [...arcs]
    .filter(a => a.start_date)
    .sort((a, b) => new Date(a.start_date!).getTime() - new Date(b.start_date!).getTime());

  const laneMap: SubLaneMap = new Map();
  const laneEnds: number[] = []; // end-ms of the last arc assigned to each lane

  for (const arc of sorted) {
    const start = new Date(arc.start_date!).getTime();
    const end   = arc.end_date ? new Date(arc.end_date).getTime() : Date.now() + 86_400_000;

    // Find first lane where this arc starts at or after the lane's last-arc end
    let lane = laneEnds.findIndex(e => start >= e);
    if (lane === -1) lane = laneEnds.length; // all occupied → open new lane

    laneEnds[lane] = Math.max(laneEnds[lane] ?? 0, end);
    laneMap.set(arc.id, lane);
  }

  return { map: laneMap, count: Math.max(1, laneEnds.length) };
}

function trackHeight(numLanes: number): number {
  return numLanes * SUBLANE_H;
}

function arcBarTop(subLane: number): number {
  return subLane * SUBLANE_H + ARC_BAR_VPAD;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

function clampDate(d: Date, min: Date, max: Date): Date {
  return new Date(Math.min(Math.max(d.getTime(), min.getTime()), max.getTime()));
}

function getMonths(start: Date, end: Date): Date[] {
  return getMonthsBetween(start, end);
}

// Assign an entry to the track of its best-matching arc by date range.
function entryTrack(entry: ChronologyEntry, arcs: LifeArc[]): ArcTrack {
  const t = new Date(entry.start_time).getTime();
  const match = arcs
    .filter(a => {
      if (!a.start_date) return false;
      const s = new Date(a.start_date).getTime();
      const e = a.end_date ? new Date(a.end_date).getTime() : Date.now();
      return t >= s && t <= e;
    })
    .sort((a, b) => b.confidence - a.confidence)[0];
  return match?.track ?? 'inner';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ArcBarProps {
  arc: LifeArc;
  x: number;
  width: number;
  subLane: number;
  onHover: (arc: LifeArc | null) => void;
  onClick: (arc: LifeArc) => void;
  onTouchSelect: (arc: LifeArc) => void;
}

const ArcBar = ({ arc, x, width, subLane, onHover, onClick, onTouchSelect }: ArcBarProps) => {
  const track = (arc.track ?? 'inner') as ArcTrack;
  const c = TRACK_COLORS[track];
  const MIN_W = 6;
  const displayWidth = Math.max(MIN_W, width);
  const isStoryArc = isNarrativeConsolidationArc(arc);

  return (
    <button
      type="button"
      title={`${arc.title}${arc.summary ? `\n${arc.summary}` : ''}`}
      onMouseEnter={() => onHover(arc)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(arc)}
      onTouchEnd={(e) => {
        e.preventDefault();
        onTouchSelect(arc);
        onClick(arc);
      }}
      style={{
        position: 'absolute',
        left: x,
        width: displayWidth,
        top: arcBarTop(subLane),
        height: ARC_BAR_H,
      }}
      className={`rounded-md border ${c.bg} ${isStoryArc ? 'border-dashed border-amber-400/50' : c.border} hover:brightness-125 transition-all group cursor-pointer`}
    >
      {/* Arc title — only shown if bar is wide enough */}
      {displayWidth > 80 && (
        <span className={`absolute inset-0 flex items-center px-2 text-[11px] font-medium truncate ${c.text} pointer-events-none`}>
          {arc.title}
        </span>
      )}
      {/* Active glow */}
      {arc.is_active && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse pointer-events-none" />
      )}
    </button>
  );
};

interface MemEventProps {
  entry: ChronologyEntry;
  x: number;
  track: ArcTrack;
  selected: boolean;
  onHover: (entry: ChronologyEntry | null) => void;
  onClick: (entry: ChronologyEntry) => void;
  onTouchSelect: (entry: ChronologyEntry) => void;
}

const MemEvent = ({ entry, x, track, selected, onHover, onClick, onTouchSelect }: MemEventProps) => {
  const c = TRACK_COLORS[track];
  const dateLabel = formatEventDateCompact(entry.start_time);

  return (
    <button
      type="button"
      title={entry.content.slice(0, 160)}
      onMouseEnter={() => onHover(entry)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(entry)}
      onTouchEnd={(e) => {
        e.preventDefault();
        onTouchSelect(entry);
        onClick(entry);
      }}
      style={{ position: 'absolute', left: x, transform: 'translateX(-50%)', top: 6 }}
      className="flex flex-col items-center gap-0.5 touch-manipulation z-[5]"
    >
      <span
        className={`text-[9px] sm:text-[10px] font-bold font-mono whitespace-nowrap px-1.5 py-0.5 rounded-md border shadow-[0_0_8px_rgba(99,102,241,0.2)] ${
          selected
            ? 'text-white border-primary/55 bg-primary/30'
            : 'text-white border-primary/35 bg-primary/15'
        }`}
      >
        {dateLabel}
      </span>
      <div className={`w-px h-3 ${selected ? 'bg-primary/70' : 'bg-white/25'}`} />
      <span
        className={`w-3 h-3 rounded-full border-2 border-black/50 transition-transform hover:scale-125 ${
          selected ? `${c.dotBg} ring-2 ring-primary/50 scale-110` : c.dotBg
        }`}
      />
    </button>
  );
};

// ─── Tooltip ──────────────────────────────────────────────────────────────────

const Tooltip = ({
  arc,
  entry,
  reserveBottomNav = false,
}: {
  arc: LifeArc | null;
  entry: ChronologyEntry | null;
  reserveBottomNav?: boolean;
}) => {
  const item = arc ?? entry;
  if (!item) return null;

  const isArc = !!arc;
  const title = isArc ? arc!.title : new Date((entry as ChronologyEntry).start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const body  = isArc ? arc!.summary : (entry as ChronologyEntry).content.slice(0, 180);
  const sub   = isArc
    ? [
        `${arc!.start_date?.slice(0, 7) ?? ''} – ${arc!.end_date?.slice(0, 7) ?? 'now'}  ·  ${TRACK_LABELS[(arc!.track ?? 'inner') as ArcTrack]}`,
        storyArcTooltipSubtitle(arc!),
      ].filter(Boolean).join('  ·  ')
    : '';

  return (
    <div
      className="pointer-events-none fixed z-50 max-w-[calc(100vw-2rem)] w-[min(20rem,calc(100vw-2rem))] px-4 py-3 rounded-2xl border border-white/15 bg-black/90 backdrop-blur-md shadow-2xl left-1/2 -translate-x-1/2"
      style={{
        bottom: reserveBottomNav
          ? `calc(${omniTimelineBottomInset} + 0.75rem)`
          : 'max(1rem, env(safe-area-inset-bottom))',
      }}
    >
      <p className="text-xs text-white/40 mb-0.5">{sub}</p>
      <p className="text-sm font-semibold text-white leading-snug mb-1">{title}</p>
      {body && <p className="text-xs text-white/65 leading-relaxed line-clamp-3">{body}</p>}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

interface TimelineSwimlanesProps {
  arcs: LifeArc[];
  arcsByTrack: Partial<Record<ArcTrack, LifeArc[]>>;
  activeArcs: LifeArc[];
  entries: ChronologyEntry[];
  loading: boolean;
  onOpenArcTimeline?: (arc: LifeArc) => void;
}

export const TimelineSwimlanes = ({
  arcs,
  arcsByTrack,
  entries,
  loading,
  onOpenArcTimeline,
}: TimelineSwimlanesProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  const isMobile = useIsMobile();
  const { openMemory } = useEntityModal();
  const [zoom, setZoom] = useState(1);
  const [hoveredArc, setHoveredArc]     = useState<LifeArc | null>(null);
  const [hoveredEntry, setHoveredEntry] = useState<ChronologyEntry | null>(null);
  const [selectedArc, setSelectedArc]   = useState<LifeArc | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ChronologyEntry | null>(null);
  const [showEventsList, setShowEventsList] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 640 : true
  );

  const sortedEntries = useMemo(() => sortEntriesChronologically(entries), [entries]);

  const ppd = BASE_PPD * zoom;

  // ── Time range ──────────────────────────────────────────────────────────────
  const today        = useMemo(() => new Date(), []);
  const timelineStart = useMemo(() => {
    const arcDates = arcs
      .filter(a => a.start_date)
      .map(a => new Date(a.start_date!));
    const entryDates = sortedEntries.slice(0, 50).map(e => new Date(e.start_time));
    const allDates   = [...arcDates, ...entryDates];
    const earliest   = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : today;
    // Show at least 3 years back
    const threeYearsAgo = new Date(today);
    threeYearsAgo.setFullYear(today.getFullYear() - 3);
    return new Date(Math.min(earliest.getTime(), threeYearsAgo.getTime()));
  }, [arcs, sortedEntries, today]);

  const totalDays  = useMemo(() => daysBetween(timelineStart, today) + 30, [timelineStart, today]);
  const totalWidth = useMemo(() => Math.round(totalDays * ppd), [totalDays, ppd]);

  // x-position in pixels for a given date
  const xOf = useCallback((date: Date | string): number => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return Math.round(daysBetween(timelineStart, d) * ppd);
  }, [timelineStart, ppd]);

  // ── Axis ticks: all months when zoomed in; Jan 'YY every 4 years when zoomed out ──
  const showAllMonthLabels = zoom >= 2;
  const showMonthGrid = zoom >= 1.5;
  const axisTicks = useMemo(
    () => buildSwimlaneAxisTicks(timelineStart, today, xOf, showAllMonthLabels),
    [showAllMonthLabels, timelineStart, today, xOf],
  );

  // ── Sub-lane layout (overlap stacking per track) ────────────────────────────
  const subLaneData = useMemo(() => {
    const result: Partial<Record<ArcTrack, { map: SubLaneMap; count: number }>> = {};
    for (const track of TRACK_ORDER) {
      result[track] = computeSubLanes(arcsByTrack[track] ?? []);
    }
    return result;
  }, [arcsByTrack]);

  // Cumulative top-offset per track (since each track has dynamic height)
  const { trackTops, totalTracksHeight } = useMemo(() => {
    let offset = AXIS_H;
    const tops: Partial<Record<ArcTrack, number>> = {};
    for (const track of TRACK_ORDER) {
      tops[track] = offset;
      offset += trackHeight(subLaneData[track]?.count ?? 1);
    }
    return { trackTops: tops, totalTracksHeight: offset - AXIS_H };
  }, [subLaneData]);

  // ── Zoom helpers ─────────────────────────────────────────────────────────────
  const zoomIn  = () => setZoom(z => Math.min(MAX_ZOOM, +(z * 1.6).toFixed(2)));
  const zoomOut = () => setZoom(z => Math.max(MIN_ZOOM, +(z / 1.6).toFixed(2)));
  const zoomReset = () => setZoom(1);

  const handleSelectArc = useCallback((arc: LifeArc) => {
    if (isMobile) setShowEventsList(false);
    // Mobile: preview in bottom sheet first; full stitched view via "Full timeline" in sheet.
    if (isMobile && onOpenArcTimeline) {
      setSelectedArc(arc);
      setSelectedEntry(null);
      return;
    }
    if (onOpenArcTimeline) {
      onOpenArcTimeline(arc);
      return;
    }
    setSelectedArc(arc);
    setSelectedEntry(null);
  }, [onOpenArcTimeline, isMobile]);

  const handleSelectEntry = useCallback((entry: ChronologyEntry) => {
    if (isMobile) setShowEventsList(false);
    setSelectedEntry(entry);
    setSelectedArc(null);
  }, [isMobile]);

  const todayX = xOf(today);

  // Scroll to "today" on first load — must run before any early return (Rules of Hooks)
  useEffect(() => {
    if (loading || (arcs.length === 0 && entries.length === 0)) return;
    if (didInitialScroll.current) return;
    const el = scrollRef.current;
    if (!el || totalWidth <= 0) return;
    const labelOffset = window.innerWidth < 640 ? LABEL_W_MOBILE : LABEL_W;
    const target = Math.max(0, todayX - el.clientWidth / 2 + labelOffset / 2);
    el.scrollLeft = target;
    didInitialScroll.current = true;
  }, [loading, arcs.length, entries.length, todayX, totalWidth]);

  // ── Empty/loading states ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="space-y-3 w-full max-w-lg px-8">
          {TRACK_ORDER.slice(0, 4).map(t => (
            <div key={t} className="flex items-center gap-3">
              <div className="w-20 h-3 bg-white/6 rounded-full animate-pulse" />
              <div className="flex-1 h-8 bg-white/4 rounded-md animate-pulse" style={{ animationDelay: `${Math.random() * 300}ms` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (arcs.length === 0 && entries.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="w-16 h-16 rounded-2xl border border-white/10 bg-white/4 flex items-center justify-center">
          <Maximize2 className="h-7 w-7 text-white/25" />
        </div>
        <div>
          <p className="text-white/60 font-medium">Your timeline is empty</p>
          <p className="text-white/30 text-sm mt-1 max-w-xs">
            Start chatting — your memories and life arcs will appear here as you share more.
          </p>
        </div>
      </div>
    );
  }

  const totalH = AXIS_H + totalTracksHeight + MEM_H;

  const displayArc = selectedArc ?? hoveredArc;
  const displayEntry = selectedEntry ?? hoveredEntry;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-black relative">
      {/* ── Zoom controls — toolbar on desktop, FAB on mobile ─────────── */}
      {isMobile ? (
        <div className="absolute right-3 bottom-3 z-20 flex flex-col gap-1.5 pointer-events-none">
          <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl border border-white/12 bg-black/85 backdrop-blur-md p-1 shadow-lg">
            <button type="button" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}
              className="w-10 h-10 rounded-xl text-white/60 active:bg-white/10 disabled:opacity-25 flex items-center justify-center touch-manipulation"
              aria-label="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </button>
            <button type="button" onClick={zoomReset}
              className="w-10 h-10 rounded-xl text-[10px] font-mono text-white/50 active:bg-white/10 touch-manipulation"
              aria-label="Reset zoom">
              {zoom.toFixed(1)}×
            </button>
            <button type="button" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}
              className="w-10 h-10 rounded-xl text-white/60 active:bg-white/10 disabled:opacity-25 flex items-center justify-center touch-manipulation"
              aria-label="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-shrink-0 flex items-center justify-end gap-1 px-4 py-2 border-b border-white/6">
          <span className="text-xs text-white/25 font-mono mr-2">{zoom.toFixed(1)}×</span>
          <button type="button" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}
            className="w-7 h-7 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition disabled:opacity-25 flex items-center justify-center">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={zoomReset}
            className="px-2.5 h-7 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition text-xs font-mono">
            1×
          </button>
          <button type="button" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}
            className="w-7 h-7 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition disabled:opacity-25 flex items-center justify-center">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Main layout: labels | scrollable canvas ───────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Fixed track labels — height mirrors the canvas track rows */}
        <div
          className={`flex-shrink-0 border-r border-white/6 bg-black flex flex-col overflow-y-hidden ${
            isMobile ? 'w-9' : 'w-24'
          }`}
        >
          <div style={{ height: AXIS_H }} className="border-b border-white/6 flex-shrink-0" />

          {TRACK_ORDER.map(track => {
            const c      = TRACK_COLORS[track];
            const lanes  = subLaneData[track]?.count ?? 1;
            const h      = trackHeight(lanes);
            const count  = (arcsByTrack[track] ?? []).length;
            return (
              <div
                key={track}
                style={{ height: h, flexShrink: 0 }}
                className={`flex flex-col justify-center border-b border-white/4 ${isMobile ? 'items-center px-0.5' : 'px-3'}`}
                title={`${TRACK_LABELS[track]}${count > 0 ? ` · ${count} arc${count !== 1 ? 's' : ''}` : ''}`}
              >
                <span className={`rounded-full flex-shrink-0 ${isMobile ? 'w-2 h-2' : 'w-1.5 h-1.5'} ${c.dotBg}`} />
                {isMobile ? (
                  <span className={`text-[8px] font-semibold leading-none mt-1 ${c.text}`}>
                    {TRACK_SHORT[track]}
                  </span>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 mt-0">
                      <span className={`text-[11px] font-medium leading-tight ${c.text}`}>{TRACK_LABELS[track]}</span>
                    </div>
                    {count > 0 && (
                      <span className="text-[10px] text-white/25 mt-0.5 pl-3">
                        {count} arc{count !== 1 ? 's' : ''}
                        {lanes > 1 && <span className="text-white/20 ml-1">· {lanes} lanes</span>}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}

          <div
            style={{ height: MEM_H, flexShrink: 0 }}
            className={`flex flex-col justify-center ${isMobile ? 'items-center px-0.5' : 'px-3'}`}
          >
            {isMobile ? (
              <span className="text-[8px] text-white/30 font-medium leading-none">Mem</span>
            ) : (
              <>
                <span className="text-[11px] text-white/30 font-medium leading-tight">Memories</span>
                {entries.length > 0 && (
                  <span className="text-[10px] text-white/20 mt-0.5">{entries.length}</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Scrollable canvas */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x"
          style={{ scrollBehavior: 'smooth' }}
        >
          <div
            className="relative"
            style={{ width: totalWidth + 60, height: totalH }}
          >
            {/* ── Year / month ruler axis ──────────────────────────────── */}
            <TimelineRulerAxis height={AXIS_H}>
              {axisTicks.map((tick, i) => (
                <TimelineRulerTick key={i} x={tick.x} label={tick.label} major={tick.major} />
              ))}
            </TimelineRulerAxis>
            {showMonthGrid &&
              getMonths(timelineStart, today).map((d, i) => (
                <TimelineRulerGridline
                  key={`grid-${i}`}
                  x={xOf(d)}
                  top={0}
                  height={totalH}
                  major={d.getMonth() === 0}
                />
              ))}

            {/* ── Track rows — height expands with sub-lane count ─────── */}
            {TRACK_ORDER.map((track, rowIdx) => {
              const rowTop  = trackTops[track] ?? AXIS_H;
              const lanes   = subLaneData[track]?.count ?? 1;
              const rowH    = trackHeight(lanes);
              const trackArcs = arcsByTrack[track] ?? [];
              return (
                <div
                  key={track}
                  className="absolute left-0 right-0 border-b border-white/4"
                  style={{ top: rowTop, height: rowH }}
                >
                  <div className={`absolute inset-0 ${rowIdx % 2 === 0 ? 'bg-white/[0.015]' : ''}`} />

                  {trackArcs.map(arc => {
                    if (!arc.start_date) return null;
                    const subLane = subLaneData[track]?.map.get(arc.id) ?? 0;
                    const x = xOf(arc.start_date);
                    const endDate = arc.end_date ? new Date(arc.end_date) : today;
                    const w = xOf(endDate) - x;
                    return (
                      <ArcBar
                        key={arc.id}
                        arc={arc}
                        x={x}
                        width={w}
                        subLane={subLane}
                        onHover={setHoveredArc}
                        onClick={handleSelectArc}
                        onTouchSelect={handleSelectArc}
                      />
                    );
                  })}
                </div>
              );
            })}

            {/* ── Memory dots row ────────────────────────────────────── */}
            <div
              className="absolute left-0 right-0"
              style={{ top: AXIS_H + totalTracksHeight, height: MEM_H }}
            >
              <div className="absolute inset-0 border-t border-white/6" />
              {sortedEntries.map(entry => {
                const x = xOf(entry.start_time);
                if (x < 0 || x > totalWidth + 30) return null;
                const track = entryTrack(entry, arcs);
                return (
                  <MemEvent
                    key={entry.id}
                    entry={entry}
                    x={x}
                    track={track}
                    selected={selectedEntry?.id === entry.id}
                    onHover={setHoveredEntry}
                    onClick={handleSelectEntry}
                    onTouchSelect={handleSelectEntry}
                  />
                );
              })}
            </div>

            {/* ── TODAY line ─────────────────────────────────────────── */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-10"
              style={{ left: todayX }}
            >
              <div className="w-0.5 h-full bg-primary/50" />
              <span className="absolute top-1 left-1.5 text-[10px] font-bold text-primary/90 whitespace-nowrap px-1.5 py-0.5 rounded bg-primary/10 border border-primary/30">
                TODAY
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stitched timeline — desktop only (mobile uses Events tab) ─── */}
      {!loading && !isMobile && (
        <div className="flex-shrink-0 border-t border-white/10 bg-black/80">
          <button
            type="button"
            onClick={() => setShowEventsList(v => !v)}
            className="w-full flex items-center justify-between px-3 sm:px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary/70" />
              <span className="text-xs font-semibold text-white/80">
                Stitched timeline
                {sortedEntries.length > 0 && ` · ${sortedEntries.length} memor${sortedEntries.length === 1 ? 'y' : 'ies'}`}
              </span>
            </div>
            <span className="text-[10px] text-white/35 uppercase tracking-wider">
              {showEventsList ? 'Hide' : 'Show'}
            </span>
          </button>
          {showEventsList && (
            <div className="max-h-[28vh] sm:max-h-[42vh] overflow-hidden flex flex-col min-h-[140px] sm:min-h-[200px]">
              <TimelineStitchedView embedded hideHeader />
            </div>
          )}
        </div>
      )}

      {/* ── Selected event detail — desktop inline, mobile sheet ──────── */}
      {isMobile ? (
        <>
          <MobileBottomSheet
            open={Boolean(selectedEntry && !selectedArc)}
            onClose={() => setSelectedEntry(null)}
            title={selectedEntry ? formatEventDateShort(selectedEntry.start_time) : undefined}
            footer={
              selectedEntry ? (
                <button
                  type="button"
                  onClick={() => openMemory(selectedEntry)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white text-sm font-semibold active:bg-primary/90"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open memory
                </button>
              ) : undefined
            }
          >
            {selectedEntry && (
              <p className="text-sm text-white/75 leading-relaxed">{selectedEntry.content}</p>
            )}
          </MobileBottomSheet>

          <MobileBottomSheet
            open={Boolean(selectedArc)}
            onClose={() => setSelectedArc(null)}
            title={selectedArc?.title}
            footer={
              selectedArc && onOpenArcTimeline ? (
                <button
                  type="button"
                  onClick={() => {
                    onOpenArcTimeline(selectedArc);
                    setSelectedArc(null);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/20 border border-primary/40 text-primary text-sm font-semibold active:bg-primary/30"
                >
                  <Layers className="h-4 w-4" />
                  Full timeline
                </button>
              ) : undefined
            }
          >
            {selectedArc && (
              <div className="space-y-3 pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${TRACK_COLORS[(selectedArc.track ?? 'inner') as ArcTrack].bg} ${TRACK_COLORS[(selectedArc.track ?? 'inner') as ArcTrack].border} ${TRACK_COLORS[(selectedArc.track ?? 'inner') as ArcTrack].text}`}>
                    {TRACK_LABELS[(selectedArc.track ?? 'inner') as ArcTrack]}
                  </span>
                  <StoryArcBadge arc={selectedArc} variant="full" />
                </div>
                <p className="text-xs text-white/40">
                  {selectedArc.start_date?.slice(0, 10)} – {selectedArc.end_date?.slice(0, 10) ?? 'ongoing'}
                </p>
                {selectedArc.summary && (
                  <p className="text-sm text-white/65 leading-relaxed">{selectedArc.summary}</p>
                )}
              </div>
            )}
          </MobileBottomSheet>
        </>
      ) : (
        <>
      {selectedEntry && !selectedArc && (
        <div className="flex-shrink-0 border-t border-white/10 bg-black/90 backdrop-blur-sm px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex-1 min-w-0 w-full">
            <p className="text-base sm:text-lg font-bold text-white flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-primary/80 shrink-0" />
              {formatEventDateShort(selectedEntry.start_time)}
            </p>
            <p className="text-sm text-white/70 leading-relaxed line-clamp-4">{selectedEntry.content}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
            <button
              type="button"
              onClick={() => openMemory(selectedEntry)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-medium hover:bg-primary/30 transition-colors min-h-[44px]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </button>
            <button
              type="button"
              onClick={() => setSelectedEntry(null)}
              className="text-white/30 hover:text-white/60 transition text-sm min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Arc detail panel (desktop) ─────────────────────────────────── */}
      {selectedArc && (
        <div className="flex-shrink-0 border-t border-white/10 bg-black/90 backdrop-blur-sm px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${TRACK_COLORS[(selectedArc.track ?? 'inner') as ArcTrack].bg} ${TRACK_COLORS[(selectedArc.track ?? 'inner') as ArcTrack].border} ${TRACK_COLORS[(selectedArc.track ?? 'inner') as ArcTrack].text}`}>
                {TRACK_LABELS[(selectedArc.track ?? 'inner') as ArcTrack]}
              </span>
              <StoryArcBadge arc={selectedArc} variant="full" />
              {selectedArc.dominant_emotion && (
                <span className="text-xs text-white/40">{selectedArc.dominant_emotion}</span>
              )}
              <span className="text-xs text-white/30 font-mono">
                {selectedArc.confidence >= 0.85 ? '████' : selectedArc.confidence >= 0.55 ? '███░' : '██░░'}
                {' '}{Math.round(selectedArc.confidence * 100)}%
              </span>
            </div>
            <p className="text-white font-semibold">{selectedArc.title}</p>
            <p className="text-xs text-white/40 mt-0.5">
              {selectedArc.start_date?.slice(0, 10)} – {selectedArc.end_date?.slice(0, 10) ?? 'ongoing'}
            </p>
            {selectedArc.summary && (
              <p className="text-sm text-white/60 mt-2 leading-relaxed">{selectedArc.summary}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
            {onOpenArcTimeline && (
              <button
                type="button"
                onClick={() => onOpenArcTimeline(selectedArc)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-medium hover:bg-primary/30 transition-colors min-h-[44px]"
              >
                <Layers className="h-3.5 w-3.5" />
                Full timeline
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedArc(null)}
              className="text-white/30 hover:text-white/60 transition text-sm min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
      )}
        </>
      )}

      {/* ── Hover tooltips (desktop only) ─────────────────────────────── */}
      {!isMobile && (displayArc || displayEntry) && (
        <Tooltip arc={displayArc} entry={displayEntry} reserveBottomNav={isMobile} />
      )}
    </div>
  );
};
