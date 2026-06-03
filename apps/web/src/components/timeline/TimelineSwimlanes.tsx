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

import { useRef, useState, useMemo, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { TRACK_COLORS, TRACK_LABELS, type LifeArc, type ArcTrack } from '../../hooks/useLifeArcs';
import type { ChronologyEntry } from '../../types/timelineV2';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_PPD      = 3;    // pixels per day at zoom 1× (~1100px per year)
const SUBLANE_H     = 44;   // px per sub-lane within a track row
const AXIS_H        = 28;   // px for the year/month axis
const MEM_H         = 64;   // px for the memory dots row
const LABEL_W       = 96;   // px for the fixed track-label column
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

function getYears(start: Date, end: Date): number[] {
  const years: number[] = [];
  for (let y = start.getFullYear(); y <= end.getFullYear() + 1; y++) years.push(y);
  return years;
}

function getMonths(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
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
}

const ArcBar = ({ arc, x, width, subLane, onHover, onClick }: ArcBarProps) => {
  const track = (arc.track ?? 'inner') as ArcTrack;
  const c = TRACK_COLORS[track];
  const MIN_W = 6;
  const displayWidth = Math.max(MIN_W, width);

  return (
    <button
      type="button"
      title={`${arc.title}${arc.summary ? `\n${arc.summary}` : ''}`}
      onMouseEnter={() => onHover(arc)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(arc)}
      style={{
        position: 'absolute',
        left: x,
        width: displayWidth,
        top: arcBarTop(subLane),
        height: ARC_BAR_H,
      }}
      className={`rounded-md border ${c.bg} ${c.border} hover:brightness-125 transition-all group cursor-pointer`}
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

interface MemDotProps {
  entry: ChronologyEntry;
  x: number;
  track: ArcTrack;
  onHover: (entry: ChronologyEntry | null, x: number) => void;
  onClick: (entry: ChronologyEntry) => void;
}

const MemDot = ({ entry, x, track, onHover, onClick }: MemDotProps) => {
  const c = TRACK_COLORS[track];
  return (
    <button
      type="button"
      title={entry.content.slice(0, 120)}
      onMouseEnter={e => onHover(entry, (e.currentTarget as HTMLElement).getBoundingClientRect().left)}
      onMouseLeave={() => onHover(null, 0)}
      onClick={() => onClick(entry)}
      style={{ position: 'absolute', left: x - 4, top: MEM_H / 2 - 4 }}
      className={`w-2 h-2 rounded-full border ${c.dotBg} border-black/40 hover:scale-150 transition-transform cursor-pointer`}
    />
  );
};

// ─── Tooltip ──────────────────────────────────────────────────────────────────

const Tooltip = ({ arc, entry }: { arc: LifeArc | null; entry: ChronologyEntry | null }) => {
  const item = arc ?? entry;
  if (!item) return null;

  const isArc = !!arc;
  const title = isArc ? arc!.title : new Date((entry as ChronologyEntry).start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const body  = isArc ? arc!.summary : (entry as ChronologyEntry).content.slice(0, 180);
  const sub   = isArc
    ? `${arc!.start_date?.slice(0, 7) ?? ''} – ${arc!.end_date?.slice(0, 7) ?? 'now'}  ·  ${TRACK_LABELS[(arc!.track ?? 'inner') as ArcTrack]}`
    : '';

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-sm w-80 px-4 py-3 rounded-2xl border border-white/15 bg-black/90 backdrop-blur-md shadow-2xl">
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
}

export const TimelineSwimlanes = ({ arcs, arcsByTrack, entries, loading }: TimelineSwimlanesProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [hoveredArc, setHoveredArc]     = useState<LifeArc | null>(null);
  const [hoveredEntry, setHoveredEntry] = useState<ChronologyEntry | null>(null);
  const [selectedArc, setSelectedArc]   = useState<LifeArc | null>(null);

  const ppd = BASE_PPD * zoom;

  // ── Time range ──────────────────────────────────────────────────────────────
  const today        = useMemo(() => new Date(), []);
  const timelineStart = useMemo(() => {
    const arcDates = arcs
      .filter(a => a.start_date)
      .map(a => new Date(a.start_date!));
    const entryDates = entries.slice(0, 50).map(e => new Date(e.start_time));
    const allDates   = [...arcDates, ...entryDates];
    const earliest   = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : today;
    // Show at least 3 years back
    const threeYearsAgo = new Date(today);
    threeYearsAgo.setFullYear(today.getFullYear() - 3);
    return new Date(Math.min(earliest.getTime(), threeYearsAgo.getTime()));
  }, [arcs, entries, today]);

  const totalDays  = useMemo(() => daysBetween(timelineStart, today) + 30, [timelineStart, today]);
  const totalWidth = useMemo(() => Math.round(totalDays * ppd), [totalDays, ppd]);

  // x-position in pixels for a given date
  const xOf = useCallback((date: Date | string): number => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return Math.round(daysBetween(timelineStart, d) * ppd);
  }, [timelineStart, ppd]);

  // ── Axis ticks ──────────────────────────────────────────────────────────────
  const showMonths = zoom >= 3;
  const axisTicks = useMemo(() => {
    if (showMonths) {
      return getMonths(timelineStart, today).map(d => ({
        x: xOf(d),
        label: d.toLocaleDateString('en-US', { month: 'short', year: d.getMonth() === 0 ? 'numeric' : undefined }),
        major: d.getMonth() === 0,
      }));
    }
    return getYears(timelineStart, today).map(y => ({
      x: xOf(new Date(y, 0, 1)),
      label: String(y),
      major: true,
    }));
  }, [showMonths, timelineStart, today, xOf]);

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

  const todayX = xOf(today);
  const totalH = AXIS_H + totalTracksHeight + MEM_H;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-black">
      {/* ── Zoom controls ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-end gap-1 px-4 py-2 border-b border-white/6">
        <span className="text-xs text-white/25 font-mono mr-2">{zoom.toFixed(1)}×</span>
        <button type="button" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}
          className="w-7 h-7 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition disabled:opacity-25 text-sm font-mono flex items-center justify-center">
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={zoomReset}
          className="px-2 h-7 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition text-xs font-mono">
          1×
        </button>
        <button type="button" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}
          className="w-7 h-7 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition disabled:opacity-25 flex items-center justify-center">
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Main layout: labels | scrollable canvas ───────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Fixed track labels — height mirrors the canvas track rows */}
        <div
          className="flex-shrink-0 border-r border-white/6 bg-black flex flex-col overflow-y-hidden"
          style={{ width: LABEL_W }}
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
                className="flex flex-col justify-center px-3 border-b border-white/4"
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dotBg}`} />
                  <span className={`text-[11px] font-medium ${c.text}`}>{TRACK_LABELS[track]}</span>
                </div>
                {count > 0 && (
                  <span className="text-[10px] text-white/25 mt-0.5 pl-3">
                    {count} arc{count !== 1 ? 's' : ''}
                    {lanes > 1 && <span className="text-white/20 ml-1">· {lanes} lanes</span>}
                  </span>
                )}
              </div>
            );
          })}

          <div style={{ height: MEM_H, flexShrink: 0 }} className="flex flex-col justify-center px-3">
            <span className="text-[11px] text-white/30 font-medium">Memories</span>
            {entries.length > 0 && (
              <span className="text-[10px] text-white/20 mt-0.5">{entries.length}</span>
            )}
          </div>
        </div>

        {/* Scrollable canvas */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden"
          style={{ scrollBehavior: 'smooth' }}
        >
          <div
            className="relative"
            style={{ width: totalWidth + 60, height: totalH }}
          >
            {/* ── Year / month axis ──────────────────────────────────── */}
            <div
              className="absolute top-0 left-0 right-0 border-b border-white/8"
              style={{ height: AXIS_H }}
            >
              {axisTicks.map((tick, i) => (
                <div
                  key={i}
                  className="absolute flex flex-col items-start"
                  style={{ left: tick.x }}
                >
                  <div className={`w-px ${tick.major ? 'h-3 bg-white/20' : 'h-2 bg-white/10'}`} />
                  <span className={`text-[10px] font-mono mt-0.5 whitespace-nowrap ${tick.major ? 'text-white/40' : 'text-white/20'}`}>
                    {tick.label}
                  </span>
                </div>
              ))}
            </div>

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
                        onClick={setSelectedArc}
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
              {entries.map(entry => {
                const x = xOf(entry.start_time);
                if (x < 0 || x > totalWidth + 30) return null;
                const track = entryTrack(entry, arcs);
                return (
                  <MemDot
                    key={entry.id}
                    entry={entry}
                    x={x}
                    track={track}
                    onHover={(e, _) => setHoveredEntry(e)}
                    onClick={() => {}}
                  />
                );
              })}
            </div>

            {/* ── TODAY line ─────────────────────────────────────────── */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-10"
              style={{ left: todayX }}
            >
              <div className="w-px h-full bg-white/20" />
              <span
                className="absolute top-1 left-1 text-[10px] text-white/40 font-mono whitespace-nowrap"
              >
                today
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Arc detail panel (shows when arc is clicked) ──────────────── */}
      {selectedArc && (
        <div className="flex-shrink-0 border-t border-white/10 bg-black/90 backdrop-blur-sm px-6 py-4 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${TRACK_COLORS[(selectedArc.track ?? 'inner') as ArcTrack].bg} ${TRACK_COLORS[(selectedArc.track ?? 'inner') as ArcTrack].border} ${TRACK_COLORS[(selectedArc.track ?? 'inner') as ArcTrack].text}`}>
                {TRACK_LABELS[(selectedArc.track ?? 'inner') as ArcTrack]}
              </span>
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
          <button
            type="button"
            onClick={() => setSelectedArc(null)}
            className="text-white/30 hover:text-white/60 transition text-sm shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Hover tooltips ────────────────────────────────────────────── */}
      <Tooltip arc={hoveredArc} entry={hoveredEntry} />
    </div>
  );
};
