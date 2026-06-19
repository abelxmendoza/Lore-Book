/**
 * EventTimelineSwimlanes
 *
 * A "swimming pool" swim-lane timeline for discrete EVENTS — reuses the same
 * visual language as TimelineSwimlanes (year/month axis, TODAY line, zoom,
 * fixed lane-label column + horizontally scrollable canvas) but is generic:
 * callers supply their own lanes and events.
 *
 * Used by:
 *   - Group/Organization modal  → lanes: "With you" / "Group only"
 *   - Character modal           → lanes: "With you" / "Without you"
 *
 * Layout math (mirrors TimelineSwimlanes):
 *   pixelsPerDay = BASE_PPD * zoom
 *   x(date)      = daysBetween(timelineStart, date) * pixelsPerDay
 * Events within a lane are packed into sub-rows with greedy interval
 * scheduling so pills never overlap.
 */

import { useMemo, useRef, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, CalendarClock } from 'lucide-react';
import {
  TIMELINE_RULER_AXIS_H,
  TimelineRulerAxis,
  TimelineRulerGridline,
  TimelineRulerTick,
} from './TimelineDateDisplay';
import { buildSwimlaneAxisTicks } from './timelineRulerTicks';

export type LaneAccent = 'emerald' | 'sky' | 'violet' | 'amber' | 'rose' | 'cyan' | 'slate';

export interface SwimlaneLane {
  key: string;
  label: string;
  accent?: LaneAccent;
  hint?: string;
}

export interface SwimlaneEvent {
  id: string;
  title: string;
  date: string;            // ISO date/time
  endDate?: string | null; // optional → renders a spanning bar
  laneKey: string;
  type?: string;
  summary?: string;
  meta?: string;           // e.g. "with Sam, Kelly"
}

interface Props {
  lanes: SwimlaneLane[];
  events: SwimlaneEvent[];
  loading?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
}

// ─── Visual constants ───────────────────────────────────────────────────────
const BASE_PPD = 3;     // px/day at 1× (~1100px/yr)
const AXIS_H = TIMELINE_RULER_AXIS_H;
const ROW_H = 48;       // taller rows to fit a title + a prominent date line
const ROW_VPAD = 6;
const LABEL_W = 120;
const PILL_W = 184;     // nominal pill width used for packing point events
const PILL_GAP = 10;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 8;

const ACCENTS: Record<LaneAccent, { pill: string; bar: string; dot: string; label: string; chip: string }> = {
  emerald: { pill: 'bg-emerald-500/15 border-emerald-400/40 hover:bg-emerald-500/25', bar: 'bg-emerald-500/30 border-emerald-400/50', dot: 'bg-emerald-400', label: 'text-emerald-300', chip: 'bg-emerald-400' },
  sky:     { pill: 'bg-sky-500/15 border-sky-400/40 hover:bg-sky-500/25',             bar: 'bg-sky-500/30 border-sky-400/50',         dot: 'bg-sky-400',     label: 'text-sky-300',     chip: 'bg-sky-400' },
  violet:  { pill: 'bg-violet-500/15 border-violet-400/40 hover:bg-violet-500/25',     bar: 'bg-violet-500/30 border-violet-400/50',   dot: 'bg-violet-400',  label: 'text-violet-300',  chip: 'bg-violet-400' },
  amber:   { pill: 'bg-amber-500/15 border-amber-400/40 hover:bg-amber-500/25',        bar: 'bg-amber-500/30 border-amber-400/50',     dot: 'bg-amber-400',   label: 'text-amber-300',   chip: 'bg-amber-400' },
  rose:    { pill: 'bg-rose-500/15 border-rose-400/40 hover:bg-rose-500/25',           bar: 'bg-rose-500/30 border-rose-400/50',       dot: 'bg-rose-400',    label: 'text-rose-300',    chip: 'bg-rose-400' },
  cyan:    { pill: 'bg-cyan-500/15 border-cyan-400/40 hover:bg-cyan-500/25',           bar: 'bg-cyan-500/30 border-cyan-400/50',       dot: 'bg-cyan-400',    label: 'text-cyan-300',    chip: 'bg-cyan-400' },
  slate:   { pill: 'bg-slate-500/15 border-slate-400/40 hover:bg-slate-500/25',        bar: 'bg-slate-500/30 border-slate-400/50',     dot: 'bg-slate-400',   label: 'text-slate-300',   chip: 'bg-slate-400' },
};

// ─── Date helpers ───────────────────────────────────────────────────────────
function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}
function fmtDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Compact date shown on each event pill (prominent, always visible).
function fmtPillDate(d: string): string {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

interface Placement { event: SwimlaneEvent; x: number; width: number; row: number; }

export const EventTimelineSwimlanes = ({ lanes, events, loading, emptyTitle, emptyHint }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<SwimlaneEvent | null>(null);
  const [selected, setSelected] = useState<SwimlaneEvent | null>(null);

  const ppd = BASE_PPD * zoom;

  const valid = useMemo(
    () => events.filter(e => e.date && !Number.isNaN(new Date(e.date).getTime())),
    [events]
  );

  const today = useMemo(() => new Date(), []);
  const timelineStart = useMemo(() => {
    const dates = valid.map(e => new Date(e.date));
    const earliest = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : today;
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);
    const start = new Date(Math.min(earliest.getTime(), oneYearAgo.getTime()));
    // pad a little to the left so the first pill isn't flush against the axis
    start.setMonth(start.getMonth() - 1);
    return start;
  }, [valid, today]);

  const totalDays = useMemo(() => daysBetween(timelineStart, today) + 45, [timelineStart, today]);
  const totalWidth = useMemo(() => Math.max(480, Math.round(totalDays * ppd)), [totalDays, ppd]);

  const xOf = useCallback(
    (date: Date | string): number => {
      const d = typeof date === 'string' ? new Date(date) : date;
      return Math.round(daysBetween(timelineStart, d) * ppd);
    },
    [timelineStart, ppd]
  );

  const showAllMonthLabels = zoom >= 2;
  const axisTicks = useMemo(
    () => buildSwimlaneAxisTicks(timelineStart, today, xOf, showAllMonthLabels),
    [showAllMonthLabels, timelineStart, today, xOf],
  );

  // Greedy sub-row packing per lane so pills never overlap.
  const { laneLayout, laneTops, totalHeight } = useMemo(() => {
    const layout = new Map<string, { placements: Placement[]; rows: number }>();
    for (const lane of lanes) {
      const laneEvents = valid
        .filter(e => e.laneKey === lane.key)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const rowRightEdge: number[] = [];
      const placements: Placement[] = [];
      for (const event of laneEvents) {
        const x = xOf(event.date);
        const width = event.endDate
          ? Math.max(PILL_W, xOf(event.endDate) - x)
          : PILL_W;
        let row = rowRightEdge.findIndex(edge => x >= edge + PILL_GAP);
        if (row === -1) row = rowRightEdge.length;
        rowRightEdge[row] = x + width;
        placements.push({ event, x, width, row });
      }
      layout.set(lane.key, { placements, rows: Math.max(1, rowRightEdge.length) });
    }

    const tops: Record<string, number> = {};
    let offset = AXIS_H;
    for (const lane of lanes) {
      tops[lane.key] = offset;
      offset += (layout.get(lane.key)?.rows ?? 1) * ROW_H + ROW_VPAD * 2;
    }
    return { laneLayout: layout, laneTops: tops, totalHeight: offset };
  }, [lanes, valid, xOf]);

  const zoomIn = () => setZoom(z => Math.min(MAX_ZOOM, +(z * 1.6).toFixed(2)));
  const zoomOut = () => setZoom(z => Math.max(MIN_ZOOM, +(z / 1.6).toFixed(2)));
  const zoomReset = () => setZoom(1);

  if (loading) {
    return (
      <div className="h-72 flex items-center justify-center">
        <div className="space-y-3 w-full max-w-lg px-8">
          {[0, 1].map(t => (
            <div key={t} className="flex items-center gap-3">
              <div className="w-24 h-3 bg-white/6 rounded-full animate-pulse" />
              <div className="flex-1 h-8 bg-white/4 rounded-md animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (valid.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="w-14 h-14 rounded-2xl border border-white/10 bg-white/4 flex items-center justify-center">
          <CalendarClock className="h-6 w-6 text-white/25" />
        </div>
        <div>
          <p className="text-white/60 font-medium">{emptyTitle ?? 'No events yet'}</p>
          <p className="text-white/30 text-sm mt-1 max-w-xs">
            {emptyHint ?? 'Events appear here chronologically as they come up in your conversations.'}
          </p>
        </div>
      </div>
    );
  }

  const todayX = xOf(today);
  const accentFor = (laneKey: string): LaneAccent =>
    lanes.find(l => l.key === laneKey)?.accent ?? 'slate';

  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-black/40 overflow-hidden">
      {/* Zoom controls */}
      <div className="flex-shrink-0 flex items-center justify-between gap-1 px-3 py-2 border-b border-white/8">
        <div className="flex items-center gap-3">
          {lanes.map(lane => (
            <div key={lane.key} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${ACCENTS[lane.accent ?? 'slate'].chip}`} />
              <span className="text-[11px] text-white/55">{lane.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-white/25 font-mono mr-1">{zoom.toFixed(1)}×</span>
          <button type="button" onClick={zoomOut} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out"
            className="w-7 h-7 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition disabled:opacity-25 flex items-center justify-center">
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={zoomReset}
            className="px-2 h-7 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition text-xs font-mono">1×</button>
          <button type="button" onClick={zoomIn} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in"
            className="w-7 h-7 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/25 transition disabled:opacity-25 flex items-center justify-center">
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* labels | scrollable canvas */}
      <div className="flex" style={{ height: totalHeight + 8 }}>
        {/* Fixed lane labels */}
        <div className="flex-shrink-0 border-r border-white/8 bg-black/60" style={{ width: LABEL_W }}>
          <div style={{ height: AXIS_H }} className="border-b border-white/8" />
          {lanes.map(lane => {
            const rows = laneLayout.get(lane.key)?.rows ?? 1;
            const h = rows * ROW_H + ROW_VPAD * 2;
            const count = laneLayout.get(lane.key)?.placements.length ?? 0;
            const a = ACCENTS[lane.accent ?? 'slate'];
            return (
              <div key={lane.key} style={{ height: h }} className="flex flex-col justify-center px-3 border-b border-white/4">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.chip}`} />
                  <span className={`text-[11px] font-medium ${a.label}`}>{lane.label}</span>
                </div>
                <span className="text-[10px] text-white/25 mt-0.5 pl-3">{count} event{count !== 1 ? 's' : ''}</span>
              </div>
            );
          })}
        </div>

        {/* Scrollable canvas */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden" style={{ scrollBehavior: 'smooth' }}>
          <div className="relative" style={{ width: totalWidth + 40, height: totalHeight }}>
            <TimelineRulerAxis height={AXIS_H}>
              {axisTicks.map((tick, i) => (
                <TimelineRulerTick key={i} x={tick.x} label={tick.label} major={tick.major} />
              ))}
            </TimelineRulerAxis>
            {axisTicks.map((tick, i) => (
              <TimelineRulerGridline
                key={`grid-${i}`}
                x={tick.x}
                top={AXIS_H}
                height={totalHeight - AXIS_H}
                major={tick.major}
              />
            ))}

            {/* Lane rows + events */}
            {lanes.map((lane, idx) => {
              const top = laneTops[lane.key] ?? AXIS_H;
              const rows = laneLayout.get(lane.key)?.rows ?? 1;
              const h = rows * ROW_H + ROW_VPAD * 2;
              const a = ACCENTS[lane.accent ?? 'slate'];
              return (
                <div key={lane.key} className="absolute left-0 right-0 border-b border-white/4" style={{ top, height: h }}>
                  <div className={`absolute inset-0 ${idx % 2 === 0 ? 'bg-white/[0.015]' : ''}`} />
                  {(laneLayout.get(lane.key)?.placements ?? []).map(({ event, x, width, row }) => {
                    const isBar = Boolean(event.endDate);
                    return (
                      <button
                        key={event.id}
                        type="button"
                        title={`${event.title}${event.summary ? `\n${event.summary}` : ''}`}
                        onMouseEnter={() => setHovered(event)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => setSelected(event)}
                        style={{ position: 'absolute', left: x, width, top: row * ROW_H + ROW_VPAD, height: ROW_H - 6 }}
                        className={`flex flex-col justify-center gap-0 px-2 py-0.5 rounded-md border text-left transition-all cursor-pointer overflow-hidden ${isBar ? a.bar : a.pill}`}
                      >
                        <span className="text-[10px] font-bold font-mono text-primary/90 leading-none tracking-tight">
                          {fmtPillDate(event.date)}
                        </span>
                        <span className="text-[11px] font-medium text-white truncate leading-tight mt-0.5">{event.title}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* TODAY line */}
            <div className="absolute top-0 bottom-0 pointer-events-none z-10" style={{ left: todayX }}>
              <div className="w-px h-full bg-white/20" />
              <span className="absolute top-1 left-1 text-[10px] text-white/40 font-mono whitespace-nowrap">today</span>
            </div>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="flex-shrink-0 border-t border-white/10 bg-black/80 px-4 py-3 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-primary/80 mb-1">{fmtDate(selected.date)}{selected.endDate ? ` → ${fmtDate(selected.endDate)}` : ''}</p>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`w-2 h-2 rounded-full ${ACCENTS[accentFor(selected.laneKey)].chip}`} />
              <span className="text-white font-semibold">{selected.title}</span>
              {selected.type && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-white/50">{selected.type}</span>
              )}
            </div>
            <p className="text-xs text-white/45">
              {selected.meta ?? ''}
            </p>
            {selected.summary && <p className="text-sm text-white/60 mt-2 leading-relaxed">{selected.summary}</p>}
          </div>
          <button type="button" onClick={() => setSelected(null)} className="text-white/30 hover:text-white/60 transition text-sm shrink-0" aria-label="Close detail">✕</button>
        </div>
      )}

      {/* Hover tooltip */}
      {hovered && !selected && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-sm w-80 px-4 py-3 rounded-2xl border border-white/15 bg-black/90 backdrop-blur-md shadow-2xl">
          <p className="text-sm font-semibold text-primary/80 mb-1">{fmtDate(hovered.date)}</p>
          <p className="text-sm font-semibold text-white leading-snug mb-1">{hovered.title}</p>
          {hovered.meta && <p className="text-xs text-white/45 mb-1">{hovered.meta}</p>}
          {hovered.summary && <p className="text-xs text-white/65 leading-relaxed line-clamp-3">{hovered.summary}</p>}
        </div>
      )}
    </div>
  );
};
