import type { LorebookContentMeterModel } from '../../lib/lorebookContentMeter';

type Props = {
  meter: LorebookContentMeterModel;
  /** Compact = inline next to a LoreBook button */
  size?: 'compact' | 'comfortable';
  className?: string;
};

/**
 * Content buildup meter shown next to LoreBook actions so users can see
 * how much evidence they have for that subject/entity (and which form tier).
 */
export function LorebookContentMeter({
  meter,
  size = 'compact',
  className = '',
}: Props) {
  const pct = Math.round(clampPercent(meter.progress) * 100);
  const compact = size === 'compact';
  const segments = meter.segmentProgress;

  return (
    <div
      className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}
      data-testid="lorebook-content-meter"
      title={meter.detailLabel}
      aria-label={meter.detailLabel}
    >
      {segments && segments.length > 1 ? (
        <div
          className={`inline-flex items-center gap-0.5 ${compact ? '' : ''}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          data-testid="lorebook-content-meter-segments"
        >
          {segments.map((seg, i) => (
            <div
              key={i}
              className={`relative overflow-hidden rounded-full bg-white/10 ${
                compact ? 'h-1.5 w-2.5 sm:w-3' : 'h-2 w-4'
              }`}
            >
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ${
                  seg >= 1
                    ? 'bg-amber-400'
                    : seg >= 0.6
                      ? 'bg-amber-400/70'
                      : 'bg-white/35'
                }`}
                style={{ width: `${Math.round(clampPercent(seg) * 100)}%` }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div
          className={`relative overflow-hidden rounded-full bg-white/10 ${
            compact ? 'h-1.5 w-14 sm:w-16' : 'h-2 w-24'
          }`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ${
              meter.ready
                ? 'bg-amber-400'
                : pct >= 60
                  ? 'bg-amber-400/70'
                  : 'bg-white/35'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <span
        className={`tabular-nums shrink-0 ${
          compact ? 'text-[10px]' : 'text-[11px]'
        } ${meter.ready ? 'text-amber-200/90' : 'text-white/45'}`}
      >
        {meter.counterLabel}
      </span>
    </div>
  );
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}
