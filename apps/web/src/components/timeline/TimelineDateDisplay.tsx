/**
 * Bright, ruler-style date display for all timeline views.
 */

import { formatEventDateShort, formatEventTime } from './timelineEventUtils';

export const TIMELINE_RULER_AXIS_H = 56;

export type RulerTick = {
  x: number;
  label: string;
  major: boolean;
};

export function parseTimelineDate(isoOrKey: string): {
  dateKey: string;
  day: number;
  monthShort: string;
  year: number;
  weekday: string;
  fullLabel: string;
} {
  const dateKey = isoOrKey.length === 10 ? isoOrKey : isoOrKey.slice(0, 10);
  const d = new Date(`${dateKey}T12:00:00`);
  return {
    dateKey,
    day: d.getDate(),
    monthShort: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    year: d.getFullYear(),
    weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
    fullLabel: d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  };
}

/** Horizontal axis container (swimlanes, event lanes). */
export function TimelineRulerAxis({
  height = TIMELINE_RULER_AXIS_H,
  children,
  className = '',
}: {
  height?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`absolute top-0 left-0 right-0 border-b-2 border-primary/40 bg-gradient-to-b from-primary/[0.14] via-black/90 to-black/95 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)] ${className}`}
      style={{ height }}
    >
      {children}
    </div>
  );
}

/** Single tick on a horizontal date ruler. */
export function TimelineRulerTick({ x, label, major }: RulerTick) {
  return (
    <div className="absolute flex flex-col items-center -translate-x-1/2" style={{ left: x }}>
      <div className={`w-0.5 ${major ? 'h-5 bg-primary/80 shadow-[0_0_6px_rgba(99,102,241,0.5)]' : 'h-3 bg-white/30'}`} />
      <span
        className={`mt-0.5 whitespace-nowrap font-mono tracking-tight ${
          major
            ? 'text-[11px] sm:text-xs font-bold text-white px-2 py-0.5 rounded-md bg-primary/30 border border-primary/50 shadow-[0_0_14px_rgba(99,102,241,0.35)]'
            : 'text-[10px] font-semibold text-white/65'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/** Vertical grid line aligned to a ruler tick. */
export function TimelineRulerGridline({
  x,
  top,
  height,
  major = false,
}: {
  x: number;
  top: number;
  height: number;
  major?: boolean;
}) {
  return (
    <div
      className={`absolute pointer-events-none w-px ${major ? 'bg-primary/20' : 'bg-white/[0.06]'}`}
      style={{ left: x, top, height }}
    />
  );
}

/** Sticky section header for chronology / list views. */
export function TimelineDateHeader({
  dateKey,
  weekday,
  count,
  sticky = true,
  className = '',
}: {
  dateKey: string;
  weekday?: string;
  count?: number;
  sticky?: boolean;
  className?: string;
}) {
  const parsed = parseTimelineDate(dateKey);
  return (
    <div
      className={`${sticky ? 'sticky top-0 z-10' : ''} -mx-3 sm:-mx-6 px-3 sm:px-6 mb-3 border-b-2 border-primary/45 bg-gradient-to-r from-primary/20 via-black/95 to-black/90 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.45)] ${className}`}
    >
      <div className="flex items-stretch gap-3 py-2.5 sm:py-3">
        <div className="flex flex-col items-center justify-center border-r-2 border-primary/55 pr-3 sm:pr-4 min-w-[3.25rem] sm:min-w-[3.75rem] shrink-0">
          <span className="text-2xl sm:text-3xl font-bold text-white leading-none tabular-nums drop-shadow-[0_0_8px_rgba(255,255,255,0.15)]">
            {parsed.day}
          </span>
          <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.14em] text-primary mt-1">
            {parsed.monthShort}
          </span>
          <span className="text-[9px] font-mono text-white/45 mt-0.5">{parsed.year}</span>
        </div>
        <div className="flex flex-col justify-center min-w-0 flex-1">
          <p className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
            {parsed.fullLabel}
          </p>
          {weekday && <p className="text-xs sm:text-sm font-medium text-primary/80">{weekday}</p>}
        </div>
        {count != null && count > 1 && (
          <span className="self-center text-[10px] uppercase tracking-wider text-white/35 font-mono shrink-0">
            {count} events
          </span>
        )}
      </div>
    </div>
  );
}

/** Compact date badge for cards and list rows. */
export function TimelineInlineDate({
  iso,
  showTime = true,
  size = 'md',
}: {
  iso: string;
  showTime?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const parsed = parseTimelineDate(iso);
  const time = showTime ? formatEventTime(iso) : null;
  const box =
    size === 'lg'
      ? 'min-w-[3.25rem] py-1.5 px-2'
      : size === 'sm'
        ? 'min-w-[2.25rem] py-0.5 px-1'
        : 'min-w-[2.75rem] py-1 px-1.5';
  const daySize = size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-sm' : 'text-lg';

  return (
    <div className="flex items-center gap-2 shrink-0">
      <div
        className={`flex flex-col items-center rounded-lg border-2 border-primary/50 bg-primary/20 shadow-[0_0_12px_rgba(99,102,241,0.28)] ${box}`}
      >
        <span className={`${daySize} font-bold text-white leading-none tabular-nums`}>{parsed.day}</span>
        <span className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider text-primary/95 mt-0.5">
          {parsed.monthShort}
        </span>
      </div>
      {(size === 'lg' || size === 'md') && (
        <div className="min-w-0 hidden sm:block">
          <p className="text-sm font-bold text-white leading-tight">{formatEventDateShort(iso)}</p>
          {time && <p className="text-[10px] text-white/45 font-mono">{time}</p>}
        </div>
      )}
    </div>
  );
}

/** Month / year banner for calendar and arc headers. */
export function TimelineMonthBanner({ label, sublabel }: { label: string; sublabel?: string }) {
  return (
    <div className="inline-flex flex-col rounded-xl border-2 border-primary/45 bg-primary/15 px-4 py-2 shadow-[0_0_16px_rgba(99,102,241,0.2)]">
      <span className="text-lg sm:text-xl font-bold text-white tracking-tight">{label}</span>
      {sublabel && <span className="text-[10px] uppercase tracking-widest text-primary/90 font-semibold mt-0.5">{sublabel}</span>}
    </div>
  );
}
