import { Sparkles } from 'lucide-react';

type NewContentMeterProps = {
  /** New units (turns/memories) accumulated since the last edition. */
  newCount: number;
  /** Unit count captured by the last edition, used to size the fill as growth-since-then. */
  priorCount: number;
  /** Prior edition number the growth is measured against. */
  sinceVersion: number;
  /** Word used for the counted unit, e.g. "turns" or "memories". */
  unitLabel: string;
};

const MIN_VISIBLE_FILL_PCT = 8;

export const NewContentMeter = ({ newCount, priorCount, sinceVersion, unitLabel }: NewContentMeterProps) => {
  const ratio = priorCount > 0 ? newCount / priorCount : 1;
  const fillPct = Math.max(Math.min(ratio, 1) * 100, MIN_VISIBLE_FILL_PCT);
  const growthPct = Math.round(ratio * 100);

  return (
    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-200/85">
        <Sparkles className="h-3 w-3 shrink-0" />
        <span>
          +{newCount} new {unitLabel} since v{sinceVersion} · +{growthPct}% growth
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`New content since version ${sinceVersion}`}
        aria-valuenow={Math.round(fillPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full rounded-full bg-black/30 overflow-hidden"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 via-emerald-400 to-fuchsia-400 transition-all"
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
};
