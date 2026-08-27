/**
 * Profile "Currently In" should show a durable life chapter, not a day occasion
 * such as a shopping trip or afterparty.
 */

export type LifeArcLike = {
  title?: string | null;
  arc_type?: string | null;
  is_active?: boolean;
  confidence?: number | null;
};

const OCCASION_TITLE =
  /\b(shopping trip|errand|afters?|afterparty|hangout|grocery|costco run)\b/i;

export function isDurableLifeArc(arc: LifeArcLike): boolean {
  if (arc.arc_type === 'occasion') return false;
  if (OCCASION_TITLE.test(arc.title ?? '')) return false;
  return true;
}

export function selectProfileLifeArcs<T extends LifeArcLike>(arcs: T[]): T[] {
  return arcs.filter((arc) => {
    if (arc.is_active === false) return false;
    if (typeof arc.confidence === 'number' && arc.confidence < 0.5) return false;
    return isDurableLifeArc(arc);
  });
}
