/**
 * TimelineSwimlanes
 *
 * Horizontal parallel-tracks visualization:
 *   - Rows = life tracks (career, romance, relationships, creative, health, inner)
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
import { ZoomIn, ZoomOut, Calendar, ExternalLink, Layers, BookOpen, Maximize2, LocateFixed, Copy, Check } from 'lucide-react';
import { copyTextToClipboard } from '../../lib/listClipboard';
import { buildSwimlanesTimelineClipboardText } from '../../lib/swimlanesTimelineClipboard';
import { LorebookContentMeter } from '../lorebook/LorebookContentMeter';
import { LorebookTierMenu } from '../lorebook/LorebookTierMenu';
import type { LorebookContentMeterModel } from '../../lib/lorebookContentMeter';
import type { LorebookForm } from '../../lib/lorebookTiers';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MobileBottomSheet } from '../ui/MobileBottomSheet';
import { NarrativeProvenancePanel } from '../narrative/NarrativeProvenancePanel';
import { omniTimelineBottomInset } from './omniTimelineLayout';
import { TRACK_COLORS, TRACK_LABELS, type LifeArc, type ArcTrack } from '../../hooks/useLifeArcs';
import { isNarrativeConsolidationArc } from '../../lib/lifeArcLabels';
import { StoryArcBadge, storyArcTooltipSubtitle } from './StoryArcBadge';
import type { ChronologyEntry } from '../../types/timelineV2';
import { useEntityModal } from '../../contexts/EntityModalContext';
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
import {
  computeSubLanes,
  clusterEntries,
  clusterRangeLabel,
  computeKnowledgeGaps,
  knowledgeGapLabel,
  readableArcWidthPx,
  ARC_READABLE_MIN_PX,
  type EntryCluster,
  type KnowledgeGap,
  type SubLaneMap,
} from './swimlaneOverlap';
import {
  PRESENT_VIEWPORT_ANCHOR,
  animateScrollLeft,
  isNearPresentScroll,
  scrollLeftForPresent,
  yearAtViewportCenter,
} from './timelinePresentViewport';
import {
  DEFAULT_ZOOM_SCALE_ID,
  TIMELINE_ZOOM_SCALES,
  buildAxisTicksForScale,
  getZoomScale,
  gridlineDatesForScale,
  scaleFromZoom,
  zoomForScale,
  type TimelineArcDetail,
  type TimelineEntryDetail,
  type TimelineZoomScaleId,
} from './timelineZoomScale';
import {
  computeFullTimelineSpan,
  computeReliableTimelineSpan,
  defaultScaleForSpanDays,
  shouldDrawSwimlaneArcBar,
} from './timelineRangeAuthority';
import type { StitchedTimelineItem } from '../../api/stitchedTimeline';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_PPD      = 3;    // pixels per day at zoom 1× (~1100px per year)
const SUBLANE_H     = 44;   // px per sub-lane within a track row
const AXIS_H        = TIMELINE_RULER_AXIS_H;
const MEM_H         = 96;   // px for labeled memory markers
const LABEL_W       = 96;   // px for the fixed track-label column (desktop)
const LABEL_W_MOBILE = 36;
const TRACK_SHORT: Record<ArcTrack, string> = {
  career: 'Work',
  romance: 'Love',
  relationships: 'Rel',
  creative: 'Art',
  health: 'Body',
  inner: 'Inner',
  mixed: 'Mix',
  custom: '•',
};
const ARC_BAR_H     = 28;   // px arc bar height
const ARC_BAR_VPAD  = 8;    // px above the bar inside its sub-lane
/** Soft floor so short eras stay readable / tappable (calendar truth preserved). */
const ARC_MIN_W     = ARC_READABLE_MIN_PX;
const MIN_ZOOM      = 0.3;
const MAX_ZOOM      = 8;
const TRACK_ORDER: ArcTrack[] = ['career', 'romance', 'relationships', 'creative', 'health', 'inner', 'mixed'];

const ERA_BAND_COLORS = [
  'rgba(99, 102, 241, 0.07)',
  'rgba(236, 72, 153, 0.06)',
  'rgba(59, 130, 246, 0.07)',
  'rgba(16, 185, 129, 0.06)',
  'rgba(245, 158, 11, 0.06)',
] as const;

/** Life-stage era band for background LOD (from Omni lifeEras). */
export type SwimlaneLifeEra = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
};

// Sub-lane layout + memory clustering live in ./swimlaneOverlap (unit-tested).

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

function canOpenAsMemory(entry: ChronologyEntry): boolean {
  return !entry.source_kind || entry.source_kind === 'journal_entry';
}

function provenanceTable(entry: ChronologyEntry): 'resolved_events' | 'journal_entries' | null {
  if (entry.source_kind === 'resolved_event') return 'resolved_events';
  if (entry.source_kind === 'timeline_event') return null;
  return 'journal_entries';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ArcBarProps {
  arc: LifeArc;
  x: number;
  width: number;
  subLane: number;
  arcDetail: TimelineArcDetail;
  onHover: (arc: LifeArc | null) => void;
  onClick: (arc: LifeArc) => void;
  onTouchSelect: (arc: LifeArc) => void;
}

const ArcBar = ({ arc, x, width, subLane, arcDetail, onHover, onClick, onTouchSelect }: ArcBarProps) => {
  const track = (arc.track ?? 'inner') as ArcTrack;
  const c = TRACK_COLORS[track];
  const displayWidth = readableArcWidthPx(width, ARC_MIN_W);
  const isStoryArc = isNarrativeConsolidationArc(arc);
  const padded = displayWidth > width + 1;
  const titleMinW = arcDetail === 'summary' ? 72 : ARC_MIN_W;
  const barH = arcDetail === 'summary' ? ARC_BAR_H - 4 : ARC_BAR_H;

  return (
    <button
      type="button"
      title={`${arc.title}${arc.summary ? `\n${arc.summary}` : ''}${
        padded ? '\n(Short span — shown larger for readability)' : ''
      }`}
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
        top: arcBarTop(subLane) + (arcDetail === 'summary' ? 2 : 0),
        height: barH,
      }}
      className={`rounded-md border ${c.bg} ${isStoryArc ? 'border-dashed border-amber-400/50' : c.border} hover:brightness-125 transition-all group cursor-pointer`}
    >
      {displayWidth >= titleMinW && (
        <span className={`absolute inset-0 flex items-center px-2 text-[10px] sm:text-[11px] font-medium truncate ${c.text} pointer-events-none`}>
          {arc.title}
        </span>
      )}
      {arc.is_active && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse pointer-events-none" />
      )}
    </button>
  );
};

function KnowledgeGapBar({
  gap,
  x,
  width,
  subLane,
  showLabel,
}: {
  gap: KnowledgeGap;
  x: number;
  width: number;
  subLane: number;
  showLabel: boolean;
}) {
  if (width < 10) return null;
  const label = knowledgeGapLabel(gap.days);
  return (
    <div
      data-testid="swimlane-knowledge-gap"
      title={`${label} — a good place to tell stories from the past`}
      style={{
        position: 'absolute',
        left: x,
        width: Math.max(10, width),
        top: arcBarTop(subLane) + 6,
        height: ARC_BAR_H - 12,
      }}
      className="rounded-md border border-dashed border-white/15 bg-[repeating-linear-gradient(-45deg,transparent,transparent_4px,rgba(255,255,255,0.04)_4px,rgba(255,255,255,0.04)_8px)] pointer-events-auto"
    >
      {showLabel && width > 96 && (
        <span className="absolute inset-0 flex items-center justify-center px-2 text-[9px] sm:text-[10px] text-white/35 truncate font-medium tracking-wide">
          {label}
        </span>
      )}
    </div>
  );
}

interface MemEventProps {
  entry: ChronologyEntry;
  x: number;
  track: ArcTrack;
  selected: boolean;
  entryDetail: TimelineEntryDetail;
  onHover: (entry: ChronologyEntry | null) => void;
  onClick: (entry: ChronologyEntry) => void;
  onTouchSelect: (entry: ChronologyEntry) => void;
}

const MemEvent = ({ entry, x, track, selected, entryDetail, onHover, onClick, onTouchSelect }: MemEventProps) => {
  const c = TRACK_COLORS[track];
  const dateLabel = formatEventDateCompact(entry.start_time);
  const showLabel = entryDetail === 'full' || entryDetail === 'compact';

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
      style={{ position: 'absolute', left: x, transform: 'translateX(-50%)', top: showLabel ? 6 : 18 }}
      className="flex flex-col items-center gap-0.5 touch-manipulation z-[5]"
    >
      {showLabel && (
        <>
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
        </>
      )}
      <span
        className={`w-3 h-3 rounded-full border-2 border-black/50 transition-transform hover:scale-125 ${
          selected ? `${c.dotBg} ring-2 ring-primary/50 scale-110` : c.dotBg
        }`}
      />
    </button>
  );
};

interface MemClusterProps {
  cluster: EntryCluster;
  selected: boolean;
  onClick: (cluster: EntryCluster) => void;
}

const MemClusterMarker = ({ cluster, selected, onClick }: MemClusterProps) => {
  const rangeLabel = clusterRangeLabel(cluster, formatEventDateCompact);

  return (
    <button
      type="button"
      title={`${cluster.entries.length} memories · ${rangeLabel}`}
      onClick={() => onClick(cluster)}
      onTouchEnd={(e) => {
        e.preventDefault();
        onClick(cluster);
      }}
      style={{ position: 'absolute', left: cluster.x, transform: 'translateX(-50%)', top: 6 }}
      className="flex flex-col items-center gap-0.5 touch-manipulation z-[6]"
    >
      <span
        className={`text-[9px] sm:text-[10px] font-bold font-mono whitespace-nowrap px-1.5 py-0.5 rounded-md border shadow-[0_0_8px_rgba(99,102,241,0.2)] ${
          selected
            ? 'text-white border-primary/55 bg-primary/30'
            : 'text-white border-primary/35 bg-primary/15'
        }`}
      >
        {rangeLabel}
      </span>
      <div className={`w-px h-3 ${selected ? 'bg-primary/70' : 'bg-white/25'}`} />
      <span
        className={`min-w-[1.375rem] h-[1.375rem] px-1 rounded-full border-2 border-black/50 bg-primary/80 text-white text-[10px] font-bold flex items-center justify-center transition-transform hover:scale-110 ${
          selected ? 'ring-2 ring-primary/50 scale-105' : ''
        }`}
      >
        {cluster.entries.length}
      </span>
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
  /** Birth-year life-stage eras for background bands at Year+ scales. */
  lifeEras?: SwimlaneLifeEra[];
  /** Temporally unresolved items (Chronology Authority tray). */
  unresolvedItems?: StitchedTimelineItem[];
  onOpenArcTimeline?: (arc: LifeArc) => void;
  onCreateLorebook?: (arc: LifeArc, form?: LorebookForm) => void;
  /** Optional readiness gate — when false, Create LoreBook is shown disabled. */
  canCreateLorebookForArc?: (arc: LifeArc) => {
    canCreate: boolean;
    reason: string;
    meter?: LorebookContentMeterModel;
  };
}

export const TimelineSwimlanes = ({
  arcs,
  arcsByTrack,
  entries,
  loading,
  lifeEras = [],
  unresolvedItems = [],
  onOpenArcTimeline,
  onCreateLorebook,
  canCreateLorebookForArc,
}: TimelineSwimlanesProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  // Anchor to keep visually fixed across a zoom change: a content position in
  // days plus the viewport x it should stay under. Applied after ppd updates.
  const pendingZoomAnchor = useRef<{ days: number; viewportX: number } | null>(null);
  const isMobile = useIsMobile();
  const { openMemory } = useEntityModal();
  const reliableSpan = useMemo(
    () => computeReliableTimelineSpan(entries, arcs),
    [entries, arcs],
  );
  // Full span (reliability aside) — the actual canvas boundary. reliableSpan
  // stays reserved for picking a sane *default* scale on load; using it for
  // the canvas itself was silently clipping genuine but lower-confidence or
  // year-precision history off-canvas at every scale, including Life.
  const fullSpan = useMemo(
    () => computeFullTimelineSpan(entries, arcs),
    [entries, arcs],
  );
  const initialScaleId = useMemo(
    () => defaultScaleForSpanDays(reliableSpan.spanDays),
    // Only seed once from first reliable span; user can still change chips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [zoom, setZoom] = useState(1);
  const [activeScale, setActiveScale] = useState<TimelineZoomScaleId>(
    () => initialScaleId || DEFAULT_ZOOM_SCALE_ID,
  );
  const [viewportYear, setViewportYear] = useState(() => new Date().getFullYear());
  const [atPresent, setAtPresent] = useState(true);
  const [copiedAll, setCopiedAll] = useState(false);
  const [showUnresolved, setShowUnresolved] = useState(false);
  const cancelPresentScroll = useRef<(() => void) | null>(null);
  const copyAllTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredArc, setHoveredArc]     = useState<LifeArc | null>(null);
  const [hoveredEntry, setHoveredEntry] = useState<ChronologyEntry | null>(null);
  const [selectedArc, setSelectedArc]   = useState<LifeArc | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ChronologyEntry | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<EntryCluster | null>(null);
  const sortedEntries = useMemo(() => sortEntriesChronologically(entries), [entries]);

  const scale = getZoomScale(activeScale);
  const ppd = BASE_PPD * zoom;

  // ── Time range (full history — every dated entry/arc, reliability aside) ──
  const today        = useMemo(() => new Date(), []);
  const timelineStart = useMemo(() => fullSpan.start, [fullSpan.start]);

  const totalDays  = useMemo(
    () => Math.max(14, daysBetween(timelineStart, today) + 14),
    [timelineStart, today],
  );

  // Bars: only multi-day non-occasion arcs (Chronology Authority arc gate).
  const drawableArcsByTrack = useMemo(() => {
    const result: Partial<Record<ArcTrack, LifeArc[]>> = {};
    for (const track of Object.keys(arcsByTrack) as ArcTrack[]) {
      result[track] = (arcsByTrack[track] ?? []).filter(shouldDrawSwimlaneArcBar);
    }
    return result;
  }, [arcsByTrack]);
  const totalWidth = useMemo(() => Math.round(totalDays * ppd), [totalDays, ppd]);

  // x-position in pixels for a given date
  const xOf = useCallback((date: Date | string): number => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return Math.round(daysBetween(timelineStart, d) * ppd);
  }, [timelineStart, ppd]);

  // ── Axis ticks: density follows the active calendar scale ───────────────
  const axisTicks = useMemo(
    () => buildAxisTicksForScale(scale, timelineStart, today, xOf),
    [scale, timelineStart, today, xOf],
  );
  const gridlineDates = useMemo(
    () => gridlineDatesForScale(scale, timelineStart, today),
    [scale, timelineStart, today],
  );

  // User-created arcs can carry track 'custom'; that row appears only when
  // such arcs exist so the fixed life tracks stay visually stable.
  const visibleTracks = useMemo<ArcTrack[]>(
    () => ((arcsByTrack.custom?.length ?? 0) > 0 ? [...TRACK_ORDER, 'custom'] : TRACK_ORDER),
    [arcsByTrack],
  );

  // ── Sub-lane layout (overlap stacking per track) ────────────────────────────
  // Zoom-aware: short arcs render at ARC_MIN_W px, so widen intervals to that
  // rendered footprint before packing to avoid visual collisions at low zoom.
  const subLaneData = useMemo(() => {
    const minSpanMs = (ARC_MIN_W / ppd) * 86_400_000;
    const result: Partial<Record<ArcTrack, { map: SubLaneMap; count: number }>> = {};
    for (const track of visibleTracks) {
      result[track] = computeSubLanes(drawableArcsByTrack[track] ?? [], minSpanMs);
    }
    return result;
  }, [drawableArcsByTrack, ppd, visibleTracks]);

  // Sparse track coverage between drawable arcs (not “forgotten lore”).
  const gapsByTrack = useMemo(() => {
    const rangeStartMs = timelineStart.getTime();
    const rangeEndMs = today.getTime();
    const result: Partial<Record<ArcTrack, KnowledgeGap[]>> = {};
    for (const track of visibleTracks) {
      result[track] = computeKnowledgeGaps(drawableArcsByTrack[track] ?? [], {
        rangeStartMs,
        rangeEndMs,
        now: rangeEndMs,
      });
    }
    return result;
  }, [drawableArcsByTrack, timelineStart, today, visibleTracks]);

  // ── Memory marker clustering (overlap merging at current zoom) ──────────────
  const entryClusters = useMemo(
    () => clusterEntries(sortedEntries, xOf, scale.clusterPx),
    [sortedEntries, xOf, scale.clusterPx],
  );

  const eraBands = useMemo(() => {
    if (!scale.showEraBands || lifeEras.length === 0) return [];
    return lifeEras
      .map((era, i) => {
        const start = new Date(era.startDate);
        const end = new Date(era.endDate);
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
        const x = xOf(start);
        const w = Math.max(8, xOf(end) - x);
        return {
          id: era.id,
          label: era.label,
          x,
          width: w,
          color: ERA_BAND_COLORS[i % ERA_BAND_COLORS.length],
        };
      })
      .filter((b): b is NonNullable<typeof b> => Boolean(b));
  }, [lifeEras, scale.showEraBands, xOf]);

  // Cumulative top-offset per track (since each track has dynamic height)
  const { trackTops, totalTracksHeight } = useMemo(() => {
    let offset = AXIS_H;
    const tops: Partial<Record<ArcTrack, number>> = {};
    for (const track of visibleTracks) {
      tops[track] = offset;
      offset += trackHeight(subLaneData[track]?.count ?? 1);
    }
    return { trackTops: tops, totalTracksHeight: offset - AXIS_H };
  }, [subLaneData, visibleTracks]);

  // ── Zoom helpers ─────────────────────────────────────────────────────────────
  // All zoom changes preserve an anchor point (cursor position for wheel-zoom,
  // viewport center for buttons) so the view doesn't jump when ppd changes.
  const zoomContext = useCallback(() => {
    const el = scrollRef.current;
    return {
      clientWidth: el?.clientWidth ?? 860,
      basePpd: BASE_PPD,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      totalDays,
    };
  }, [totalDays]);

  const setZoomAnchored = useCallback((nextZoom: number, anchorClientX?: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +nextZoom.toFixed(2)));
    const el = scrollRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const viewportX = anchorClientX != null
        ? Math.max(0, Math.min(el.clientWidth, anchorClientX - rect.left))
        : el.clientWidth / 2;
      pendingZoomAnchor.current = {
        days: (el.scrollLeft + viewportX) / ppd,
        viewportX,
      };
    }
    setZoom(clamped);
    setActiveScale(scaleFromZoom(clamped, zoomContext()));
  }, [ppd, zoomContext]);

  const applyZoomScale = useCallback((scaleId: TimelineZoomScaleId) => {
    const el = scrollRef.current;
    if (!el) return;
    const nextScale = getZoomScale(scaleId);
    const nextZoom = zoomForScale(nextScale, {
      clientWidth: el.clientWidth,
      basePpd: BASE_PPD,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      totalDays,
    });
    pendingZoomAnchor.current = {
      days: Math.max(0, daysBetween(timelineStart, today)),
      viewportX: el.clientWidth * PRESENT_VIEWPORT_ANCHOR,
    };
    setActiveScale(scaleId);
    if (Math.abs(nextZoom - zoom) < 0.001) {
      const prevBehavior = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      el.scrollLeft = scrollLeftForPresent(xOf(today), el.clientWidth);
      el.style.scrollBehavior = prevBehavior;
      pendingZoomAnchor.current = null;
    } else {
      setZoom(nextZoom);
    }
  }, [totalDays, timelineStart, today, zoom, xOf]);

  const zoomIn  = () => setZoomAnchored(zoom * 1.6);
  const zoomOut = () => setZoomAnchored(zoom / 1.6);

  const syncViewportChrome = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientWidth <= 0 || ppd <= 0) return;
    const next = yearAtViewportCenter(el.scrollLeft, el.clientWidth, timelineStart, ppd);
    setViewportYear((prev) => (prev === next ? prev : next));
    const near = isNearPresentScroll(el.scrollLeft, xOf(today), el.clientWidth);
    setAtPresent((prev) => (prev === near ? prev : near));
  }, [timelineStart, ppd, today, xOf]);

  const goToPresent = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    cancelPresentScroll.current?.();
    const target = scrollLeftForPresent(xOf(today), el.clientWidth);
    cancelPresentScroll.current = animateScrollLeft(el, target, 280, () => {
      cancelPresentScroll.current = null;
      syncViewportChrome();
    });
  }, [today, xOf, syncViewportChrome]);

  const handleCopyAll = useCallback(async () => {
    const subLaneByTrack: Partial<Record<ArcTrack, SubLaneMap>> = {};
    for (const track of visibleTracks) {
      const map = subLaneData[track]?.map;
      if (map) subLaneByTrack[track] = map;
    }
    const text = buildSwimlanesTimelineClipboardText({
      scaleId: scale.id,
      scaleLabel: scale.label,
      zoom,
      pixelsPerDay: ppd,
      timelineStartIso: timelineStart.toISOString(),
      todayIso: today.toISOString(),
      totalDays,
      totalWidthPx: totalWidth,
      clusterPx: scale.clusterPx,
      showEraBands: scale.showEraBands,
      eras: lifeEras,
      tracks: visibleTracks,
      arcs,
      arcsByTrack,
      subLaneByTrack,
      gapsByTrack,
      entries: sortedEntries,
      clusters: entryClusters,
      xOf,
    });
    const ok = await copyTextToClipboard(text);
    if (!ok) return;
    setCopiedAll(true);
    if (copyAllTimer.current) clearTimeout(copyAllTimer.current);
    copyAllTimer.current = setTimeout(() => setCopiedAll(false), 2000);
  }, [
    visibleTracks,
    subLaneData,
    scale,
    zoom,
    ppd,
    timelineStart,
    today,
    totalDays,
    totalWidth,
    lifeEras,
    arcs,
    arcsByTrack,
    gapsByTrack,
    sortedEntries,
    entryClusters,
    xOf,
  ]);

  useEffect(() => () => {
    cancelPresentScroll.current?.();
    if (copyAllTimer.current) clearTimeout(copyAllTimer.current);
  }, []);

  // Re-apply the anchor once the canvas has been laid out at the new zoom.
  useEffect(() => {
    const anchor = pendingZoomAnchor.current;
    const el = scrollRef.current;
    if (!anchor || !el) return;
    pendingZoomAnchor.current = null;
    const prevBehavior = el.style.scrollBehavior;
    el.style.scrollBehavior = 'auto'; // jump, don't animate, while re-anchoring
    el.scrollLeft = Math.max(0, anchor.days * ppd - anchor.viewportX);
    el.style.scrollBehavior = prevBehavior;
    syncViewportChrome();
  }, [ppd, syncViewportChrome]);

  // Ctrl/Cmd + wheel zooms at the cursor. Native listener because React's
  // synthetic wheel handler is passive and can't preventDefault page zoom.
  const wheelZoomRef = useRef<(z: number, x?: number) => void>(setZoomAnchored);
  wheelZoomRef.current = setZoomAnchored;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.002);
      wheelZoomRef.current(zoomRef.current * factor, e.clientX);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // Re-run once real content mounts — during loading/empty states the
    // scroll container doesn't exist yet and the listener can't attach.
  }, [loading, arcs.length, entries.length]);

  const handleSelectArc = useCallback((arc: LifeArc) => {
    if (onOpenArcTimeline) {
      onOpenArcTimeline(arc);
      return;
    }
    setSelectedArc(arc);
    setSelectedEntry(null);
    setSelectedCluster(null);
  }, [onOpenArcTimeline]);

  const handleSelectEntry = useCallback((entry: ChronologyEntry) => {
    setSelectedEntry(entry);
    setSelectedArc(null);
    setSelectedCluster(null);
  }, []);

  const handleSelectCluster = useCallback((cluster: EntryCluster) => {
    setSelectedCluster(prev => (prev?.key === cluster.key ? null : cluster));
    setSelectedEntry(null);
    setSelectedArc(null);
  }, []);

  const todayX = xOf(today);
  const todayDays = useMemo(
    () => Math.max(0, daysBetween(timelineStart, today)),
    [timelineStart, today],
  );

  // Always open on the present: year-scale zoom with "today" near the right edge.
  // Wait for a real clientWidth (loading → content swap can leave the ref unset).
  useEffect(() => {
    if (loading || (arcs.length === 0 && entries.length === 0)) return;
    if (didInitialScroll.current) return;

    let cancelled = false;
    let attempts = 0;

    const applyPresentStart = (): boolean => {
      if (cancelled || didInitialScroll.current) return true;
      const el = scrollRef.current;
      if (!el || el.clientWidth <= 0 || totalWidth <= 0) return false;

      const openScale = defaultScaleForSpanDays(reliableSpan.spanDays);
      const nextZoom = zoomForScale(openScale, {
        clientWidth: el.clientWidth,
        basePpd: BASE_PPD,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        totalDays,
      });
      pendingZoomAnchor.current = {
        days: todayDays,
        viewportX: el.clientWidth * PRESENT_VIEWPORT_ANCHOR,
      };
      setActiveScale(openScale);
      // If zoom is already at the target, still pin scroll (anchor effect only
      // runs when ppd changes).
      if (Math.abs(nextZoom - zoomRef.current) < 0.001) {
        const prevBehavior = el.style.scrollBehavior;
        el.style.scrollBehavior = 'auto';
        el.scrollLeft = scrollLeftForPresent(todayX, el.clientWidth);
        el.style.scrollBehavior = prevBehavior;
        pendingZoomAnchor.current = null;
      } else {
        setZoom(nextZoom);
      }
      didInitialScroll.current = true;
      return true;
    };

    const tick = () => {
      if (applyPresentStart()) return;
      attempts += 1;
      if (attempts < 12) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [loading, arcs.length, entries.length, todayDays, todayX, totalWidth, totalDays, reliableSpan.spanDays]);

  useEffect(() => {
    if (loading || (arcs.length === 0 && entries.length === 0)) return;
    const id = requestAnimationFrame(() => syncViewportChrome());
    return () => cancelAnimationFrame(id);
  }, [loading, arcs.length, entries.length, syncViewportChrome, totalWidth]);

  // ── Empty/loading states ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[280px] flex items-center justify-center">
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
      <div className="min-h-[280px] flex flex-col items-center justify-center gap-4 px-8 text-center">
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
    <div className="timeline-swimlanes-root flex flex-col bg-black relative w-full min-h-[280px]">
      {onCreateLorebook && arcs.length > 0 && (
        <div
          className="flex-shrink-0 px-3 sm:px-4 py-2 border-b border-amber-500/20 bg-amber-500/5 text-[11px] sm:text-xs text-amber-100/80 flex items-start gap-2"
          data-testid="swimlanes-lorebook-hint"
        >
          <BookOpen className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-300/90" />
          <p>
            Select a life arc to open its timeline or compile a{' '}
            <span className="text-amber-200 font-medium">LoreBook</span> when there’s enough
            content about that subject or domain.
          </p>
        </div>
      )}
      {/* ── Time scale chrome ─────────────────────────────────────────── */}
      <div
        className="timeline-zoom-chrome flex-shrink-0 border-b border-white/8 px-3 sm:px-5 py-2 overflow-x-hidden"
        data-testid="timeline-zoom-chrome"
      >
        <div className="flex items-center gap-2 min-w-0 max-w-full">
          <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-white/30 font-mono shrink-0">
            Scale
          </span>
          <div
            className="timeline-zoom-scale-chips flex items-center gap-0.5 overflow-x-auto scrollbar-hide min-w-0 flex-1"
            role="radiogroup"
            aria-label="Timeline time scale"
          >
            {TIMELINE_ZOOM_SCALES.map((s) => {
              const active = activeScale === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={s.label}
                  title={s.label}
                  onClick={() => applyZoomScale(s.id)}
                  className={`timeline-zoom-scale-chip shrink-0 ${active ? 'timeline-zoom-scale-chip--active' : ''}`}
                >
                  <span className="sm:hidden" aria-hidden="true">{s.shortLabel}</span>
                  <span className="hidden sm:inline" aria-hidden="true">{s.label}</span>
                </button>
              );
            })}
          </div>
          <div className="timeline-zoom-chrome__steps flex items-center gap-1 shrink-0">
            <span className="text-[10px] sm:text-xs text-white/30 font-mono tabular-nums mr-0.5">
              {zoom.toFixed(1)}×
            </span>
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
              title="Zoom out"
              className="timeline-zoom-step-btn"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
              title="Zoom in"
              className="timeline-zoom-step-btn"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="hidden lg:block text-[10px] text-white/20 mt-1.5">
          ⌘/Ctrl + scroll to zoom · eras show at Year and wider
        </p>
      </div>

      {/* Centered year + Go to present (inset from edges) */}
      <div
        className="timeline-viewport-year-bar flex-shrink-0 border-b border-white/8 bg-gradient-to-b from-primary/10 to-transparent"
        data-testid="swimlanes-viewport-year"
        aria-live="polite"
      >
        <div className="timeline-viewport-year-bar__slot timeline-viewport-year-bar__slot--start">
          <button
            type="button"
            onClick={() => void handleCopyAll()}
            aria-label="Copy all swimlanes timeline"
            title="Copy full swimlanes dump: architecture, nested arcs, moments, dates, pixel positions"
            data-testid="swimlanes-copy-all"
            className="timeline-copy-all"
          >
            {copiedAll ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
            <span>{copiedAll ? 'Copied' : 'Copy all'}</span>
          </button>
        </div>
        <span
          key={viewportYear}
          className="timeline-viewport-year-bar__year text-xl sm:text-2xl font-bold tracking-tight text-white tabular-nums animate-in fade-in zoom-in-95 duration-200"
        >
          {viewportYear}
        </span>
        <div className="timeline-viewport-year-bar__slot timeline-viewport-year-bar__slot--end">
          <button
            type="button"
            onClick={goToPresent}
            disabled={atPresent}
            aria-label="Go to present"
            title="Jump the timeline to today"
            data-testid="swimlanes-go-to-present"
            className={`timeline-go-present ${atPresent ? 'timeline-go-present--idle' : 'timeline-go-present--active'}`}
          >
            <LocateFixed className="h-3.5 w-3.5 shrink-0" />
            <span>Present</span>
          </button>
        </div>
      </div>

      {unresolvedItems.length > 0 && (
        <div
          className="flex-shrink-0 border-b border-amber-500/20 bg-amber-500/5 px-3 sm:px-5 py-2"
          data-testid="swimlanes-unresolved-tray"
        >
          <button
            type="button"
            className="flex items-center gap-2 text-left w-full"
            onClick={() => setShowUnresolved((v) => !v)}
            aria-expanded={showUnresolved}
          >
            <span className="text-[11px] font-semibold text-amber-200/90">
              Memories with unresolved dates ({unresolvedItems.length})
            </span>
            <span className="text-[10px] text-amber-100/50">
              {showUnresolved ? 'Hide' : 'Show'} — these do not stretch the canvas
            </span>
          </button>
          {showUnresolved && (
            <ul className="mt-2 max-h-36 overflow-y-auto space-y-1.5 pr-1">
              {unresolvedItems.slice(0, 40).map((item) => (
                <li
                  key={item.id}
                  className="text-[11px] text-white/65 leading-snug border-l border-amber-500/30 pl-2"
                >
                  <span className="text-white/85 font-medium">{item.title}</span>
                  {item.timeConfidence != null && (
                    <span className="text-white/35 ml-1.5">
                      conf {(item.timeConfidence * 100).toFixed(0)}%
                    </span>
                  )}
                  {item.body?.trim() && (
                    <p className="text-white/40 line-clamp-2 mt-0.5">{item.body.trim()}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Main layout: labels | scrollable canvas ───────────────────── */}
      <div className="flex shrink-0 overflow-hidden" style={{ height: totalH }}>
        {/* Fixed track labels — height mirrors the canvas track rows */}
        <div
          className={`flex-shrink-0 border-r border-white/6 bg-black flex flex-col overflow-y-hidden ${
            isMobile ? 'w-9' : 'w-24'
          }`}
        >
          <div style={{ height: AXIS_H }} className="border-b border-white/6 flex-shrink-0" />

          {visibleTracks.map(track => {
            const c      = TRACK_COLORS[track];
            const lanes  = subLaneData[track]?.count ?? 1;
            const h      = trackHeight(lanes);
            const count  = (drawableArcsByTrack[track] ?? []).length;
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
          className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain"
          style={{ scrollBehavior: 'smooth', touchAction: 'pan-x pan-y' }}
          onScroll={syncViewportChrome}
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
            {gridlineDates.map((d, i) => (
              <TimelineRulerGridline
                key={`grid-${i}`}
                x={xOf(d)}
                top={0}
                height={totalH}
                major={scale.ruler === 'week' ? d.getDate() <= 7 : d.getMonth() === 0 || scale.ruler !== 'month'}
              />
            ))}

            {/* ── Life-era background bands (Year+ scales) ─────────────── */}
            {eraBands.map((band) => (
              <div
                key={band.id}
                data-testid="swimlane-era-band"
                title={band.label}
                className="absolute top-0 bottom-0 pointer-events-none border-l border-white/[0.04]"
                style={{ left: band.x, width: band.width, background: band.color, zIndex: 0 }}
              >
                {band.width > 64 && (
                  <span className="absolute top-[58px] left-1.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-white/25 truncate max-w-[calc(100%-8px)]">
                    {band.label}
                  </span>
                )}
              </div>
            ))}

            {/* ── Track rows — height expands with sub-lane count ─────── */}
            {visibleTracks.map((track, rowIdx) => {
              const rowTop  = trackTops[track] ?? AXIS_H;
              const lanes   = subLaneData[track]?.count ?? 1;
              const rowH    = trackHeight(lanes);
              const trackArcs = drawableArcsByTrack[track] ?? [];
              return (
                <div
                  key={track}
                  className="absolute left-0 right-0 border-b border-white/4"
                  style={{ top: rowTop, height: rowH, zIndex: 1 }}
                >
                  <div className={`absolute inset-0 ${rowIdx % 2 === 0 ? 'bg-white/[0.015]' : ''}`} />

                  {(gapsByTrack[track] ?? []).map((gap) => {
                    const x = xOf(new Date(gap.startMs));
                    const w = xOf(new Date(gap.endMs)) - x;
                    return (
                      <KnowledgeGapBar
                        key={gap.key}
                        gap={gap}
                        x={x}
                        width={w}
                        subLane={0}
                        showLabel={scale.arcDetail === 'labelled'}
                      />
                    );
                  })}

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
                        arcDetail={scale.arcDetail}
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
              style={{ top: AXIS_H + totalTracksHeight, height: MEM_H, zIndex: 1 }}
            >
              <div className="absolute inset-0 border-t border-white/6" />
              {entryClusters.map(cluster => {
                if (cluster.x < 0 || cluster.x > totalWidth + 30) return null;
                if (cluster.entries.length === 1) {
                  const entry = cluster.entries[0];
                  return (
                    <MemEvent
                      key={cluster.key}
                      entry={entry}
                      x={cluster.x}
                      track={entryTrack(entry, arcs)}
                      selected={selectedEntry?.id === entry.id}
                      entryDetail={scale.entryDetail}
                      onHover={setHoveredEntry}
                      onClick={handleSelectEntry}
                      onTouchSelect={handleSelectEntry}
                    />
                  );
                }
                return (
                  <MemClusterMarker
                    key={cluster.key}
                    cluster={cluster}
                    selected={selectedCluster?.key === cluster.key}
                    onClick={handleSelectCluster}
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

      {/* ── Selected event detail — desktop inline, mobile sheet ──────── */}
      {isMobile ? (
        <>
          <MobileBottomSheet
            open={Boolean(selectedEntry && !selectedArc)}
            onClose={() => setSelectedEntry(null)}
            title={selectedEntry ? formatEventDateShort(selectedEntry.start_time) : undefined}
            footer={
              selectedEntry && canOpenAsMemory(selectedEntry) ? (
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
              <div className="space-y-4">
                <p className="text-sm text-white/75 leading-relaxed">{selectedEntry.content}</p>
                {provenanceTable(selectedEntry) && (
                  <NarrativeProvenancePanel
                    sourceTable={provenanceTable(selectedEntry)!}
                    sourceId={selectedEntry.source_id ?? selectedEntry.journal_entry_id}
                    compact
                    defaultExpanded={false}
                    title="What supports this memory?"
                  />
                )}
              </div>
            )}
          </MobileBottomSheet>

          <MobileBottomSheet
            open={Boolean(selectedCluster)}
            onClose={() => setSelectedCluster(null)}
            title={
              selectedCluster
                ? `${selectedCluster.entries.length} memories · ${clusterRangeLabel(selectedCluster, formatEventDateCompact)}`
                : undefined
            }
          >
            {selectedCluster && (
              <div className="space-y-2 pb-2">
                {selectedCluster.entries.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleSelectEntry(entry)}
                    className="w-full text-left px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] active:bg-white/10"
                  >
                    <span className="text-[11px] font-mono text-primary/80">
                      {formatEventDateShort(entry.start_time)}
                    </span>
                    <p className="text-sm text-white/75 leading-snug line-clamp-2 mt-0.5">{entry.content}</p>
                  </button>
                ))}
              </div>
            )}
          </MobileBottomSheet>

          <MobileBottomSheet
            open={Boolean(selectedArc)}
            onClose={() => setSelectedArc(null)}
            title={selectedArc?.title}
            footer={
              selectedArc && (onOpenArcTimeline || onCreateLorebook) ? (
                <div className="flex gap-2">
                  {onOpenArcTimeline && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenArcTimeline(selectedArc);
                        setSelectedArc(null);
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/20 border border-primary/40 text-primary text-sm font-semibold active:bg-primary/30"
                    >
                      <Layers className="h-4 w-4" />
                      Full timeline
                    </button>
                  )}
                  {onCreateLorebook && selectedArc.start_date && (
                    <div className="flex-1 flex flex-col gap-1.5 items-center">
                      {canCreateLorebookForArc?.(selectedArc).meter?.tierOffer ? (
                        <div className="w-full flex justify-center rounded-xl bg-amber-500/15 border border-amber-500/40 py-2.5 px-3">
                          <LorebookTierMenu
                            tierOffer={canCreateLorebookForArc(selectedArc).meter!.tierOffer!}
                            buttonLabel="Create LoreBook"
                            forceEnable={
                              canCreateLorebookForArc(selectedArc).canCreate &&
                              !canCreateLorebookForArc(selectedArc).meter!.tierOffer!.canCreateAny
                            }
                            onSelectForm={(form) => {
                              onCreateLorebook(selectedArc, form);
                              setSelectedArc(null);
                            }}
                            subjectLabel={selectedArc.title}
                            testId="swimlane-mobile-lorebook-tier-menu"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={
                            canCreateLorebookForArc
                              ? !canCreateLorebookForArc(selectedArc).canCreate
                              : false
                          }
                          onClick={() => {
                            if (
                              canCreateLorebookForArc &&
                              !canCreateLorebookForArc(selectedArc).canCreate
                            ) {
                              return;
                            }
                            onCreateLorebook(selectedArc);
                            setSelectedArc(null);
                          }}
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-sm font-semibold active:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Create LoreBook
                        </button>
                      )}
                      {canCreateLorebookForArc?.(selectedArc).meter && (
                        <div className="flex justify-center">
                          <LorebookContentMeter
                            meter={canCreateLorebookForArc(selectedArc).meter!}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
      {/* ── Cluster detail panel (desktop) — pick a memory from the group ── */}
      {selectedCluster && !selectedEntry && !selectedArc && (
        <div className="flex-shrink-0 border-t border-white/10 bg-black/90 backdrop-blur-sm px-4 sm:px-6 py-3 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-4 mb-2">
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary/80 shrink-0" />
              {selectedCluster.entries.length} memories · {clusterRangeLabel(selectedCluster, formatEventDateCompact)}
            </p>
            <button
              type="button"
              onClick={() => setSelectedCluster(null)}
              className="text-white/30 hover:text-white/60 transition text-sm min-h-[32px] min-w-[32px] flex items-center justify-center"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {selectedCluster.entries.map(entry => (
              <button
                key={entry.id}
                type="button"
                onClick={() => handleSelectEntry(entry)}
                className="shrink-0 w-56 text-left px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] hover:border-primary/40 hover:bg-white/[0.06] transition"
              >
                <span className="text-[11px] font-mono text-primary/80">
                  {formatEventDateShort(entry.start_time)}
                </span>
                <p className="text-xs text-white/65 leading-snug line-clamp-2 mt-0.5">{entry.content}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedEntry && !selectedArc && (
        <div className="flex-shrink-0 border-t border-white/10 bg-black/90 backdrop-blur-sm px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex-1 min-w-0 w-full">
            <p className="text-base sm:text-lg font-bold text-white flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-primary/80 shrink-0" />
              {formatEventDateShort(selectedEntry.start_time)}
            </p>
            <p className="text-sm text-white/70 leading-relaxed line-clamp-4">{selectedEntry.content}</p>
            <div className="mt-3">
              {provenanceTable(selectedEntry) && (
                <NarrativeProvenancePanel
                  sourceTable={provenanceTable(selectedEntry)!}
                  sourceId={selectedEntry.source_id ?? selectedEntry.journal_entry_id}
                  compact
                  defaultExpanded={false}
                  title="What supports this memory?"
                />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
            {canOpenAsMemory(selectedEntry) && (
              <button
                type="button"
                onClick={() => openMemory(selectedEntry)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-medium hover:bg-primary/30 transition-colors min-h-[44px]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </button>
            )}
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
            {onCreateLorebook && selectedArc.start_date && (
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 pl-3 pr-2 py-1.5 min-h-[44px]">
                {canCreateLorebookForArc?.(selectedArc).meter?.tierOffer ? (
                  <LorebookTierMenu
                    tierOffer={canCreateLorebookForArc(selectedArc).meter!.tierOffer!}
                    forceEnable={
                      canCreateLorebookForArc(selectedArc).canCreate &&
                      !canCreateLorebookForArc(selectedArc).meter!.tierOffer!.canCreateAny
                    }
                    onSelectForm={(form) => onCreateLorebook(selectedArc, form)}
                    subjectLabel={selectedArc.title}
                    testId="swimlane-lorebook-tier-menu"
                  />
                ) : (
                  <button
                    type="button"
                    disabled={
                      canCreateLorebookForArc
                        ? !canCreateLorebookForArc(selectedArc).canCreate
                        : false
                    }
                    onClick={() => {
                      if (
                        canCreateLorebookForArc &&
                        !canCreateLorebookForArc(selectedArc).canCreate
                      ) {
                        return;
                      }
                      onCreateLorebook(selectedArc);
                    }}
                    className="inline-flex items-center gap-1.5 text-amber-300 text-xs font-medium hover:text-amber-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    LoreBook
                  </button>
                )}
                {canCreateLorebookForArc?.(selectedArc).meter && (
                  <LorebookContentMeter meter={canCreateLorebookForArc(selectedArc).meter!} />
                )}
              </div>
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
