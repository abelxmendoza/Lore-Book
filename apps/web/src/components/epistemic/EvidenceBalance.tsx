import { CircleHelp, Minus, ShieldCheck, ShieldQuestion } from 'lucide-react';

type Props = {
  supporting?: number;
  challenging?: number;
  contextual?: number;
  unknown?: boolean;
  compact?: boolean;
};

export function EvidenceBalance({
  supporting = 0,
  challenging = 0,
  contextual = 0,
  unknown = false,
  compact = false,
}: Props) {
  if (unknown) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-white/40">
        <CircleHelp className="h-3 w-3" aria-hidden="true" />
        Evidence available in inspector
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-white/45" aria-label="Evidence balance">
      <span className="inline-flex items-center gap-1 text-emerald-300/80">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        {supporting} {compact ? 'support' : 'supporting'}
      </span>
      <span className="inline-flex items-center gap-1 text-rose-300/80">
        <ShieldQuestion className="h-3 w-3" aria-hidden="true" />
        {challenging} {compact ? 'challenge' : 'challenging'}
      </span>
      {contextual > 0 ? (
        <span className="inline-flex items-center gap-1 text-white/45">
          <Minus className="h-3 w-3" aria-hidden="true" />
          {contextual} context
        </span>
      ) : null}
    </div>
  );
}
