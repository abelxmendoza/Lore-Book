import type { LifeArc } from './arcService';

const DAY_MS = 86_400_000;

export type LifeArcSuppressionReason =
  | 'occasion'
  | 'explicitly_suppressed'
  | 'missing_start_date'
  | 'invalid_dates'
  | 'single_day_span'
  | 'insufficient_evidence';

export type LifeArcBarEligibility = {
  drawable: boolean;
  reason: LifeArcSuppressionReason | null;
};

export function lifeArcBarEligibility(
  arc: Pick<LifeArc, 'arc_type' | 'start_date' | 'end_date' | 'metadata'>,
): LifeArcBarEligibility {
  if (arc.arc_type === 'occasion') return { drawable: false, reason: 'occasion' };
  if ((arc.metadata as { omni_draw_bar?: boolean } | null)?.omni_draw_bar === false) {
    return { drawable: false, reason: 'explicitly_suppressed' };
  }
  if (!arc.start_date) return { drawable: false, reason: 'missing_start_date' };

  const start = new Date(arc.start_date).getTime();
  const end = new Date(arc.end_date ?? arc.start_date).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { drawable: false, reason: 'invalid_dates' };
  }
  if (Math.round((end - start) / DAY_MS) < 2) {
    return { drawable: false, reason: 'single_day_span' };
  }

  const evidenceCount = Array.isArray((arc.metadata as { source_record_ids?: unknown } | null)?.source_record_ids)
    ? ((arc.metadata as { source_record_ids: unknown[] }).source_record_ids.length)
    : null;
  if (evidenceCount !== null && evidenceCount < 2) {
    return { drawable: false, reason: 'insufficient_evidence' };
  }

  return { drawable: true, reason: null };
}
