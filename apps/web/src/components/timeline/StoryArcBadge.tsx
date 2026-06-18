import { formatNarrativeStages, isNarrativeConsolidationArc, STAGE_LABELS, type NarrativeConsolidationMetadata } from '../../lib/lifeArcLabels';
import type { LifeArc } from '../hooks/useLifeArcs';

interface StoryArcBadgeProps {
  arc: LifeArc;
  /** compact = single chip; full = chip + stage pills */
  variant?: 'compact' | 'full';
}

export function StoryArcBadge({ arc, variant = 'compact' }: StoryArcBadgeProps) {
  if (!isNarrativeConsolidationArc(arc)) return null;

  const stages = formatNarrativeStages(arc).slice(0, 4);

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-400/35 bg-amber-400/10 text-amber-200/90 font-medium">
        Story arc
      </span>
      {variant === 'full' && stages.map((stage) => (
        <span
          key={stage}
          className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/45"
        >
          {STAGE_LABELS[stage] ?? stage}
        </span>
      ))}
    </span>
  );
}

export function storyArcTooltipSubtitle(arc: LifeArc): string | null {
  if (!isNarrativeConsolidationArc(arc)) return null;
  const stages = formatNarrativeStages(arc);
  if (stages.length === 0) return 'Lexical story arc';
  return `Story arc · ${stages.map((s) => STAGE_LABELS[s] ?? s).join(' → ')}`;
}

export function getSourceEventCount(arc: LifeArc): number | null {
  const meta = arc.metadata as NarrativeConsolidationMetadata | undefined;
  return meta?.source_event_ids?.length ?? null;
}
