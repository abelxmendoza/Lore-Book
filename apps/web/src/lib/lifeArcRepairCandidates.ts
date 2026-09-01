import type { ArcType, ArcTrack, LifeArc } from '../hooks/useLifeArcs';

const DAY_MS = 86_400_000;

export function arcSpanDays(arc: Pick<LifeArc, 'start_date' | 'end_date'>): number | null {
  if (!arc.start_date) return null;
  const start = new Date(arc.start_date).getTime();
  const end = new Date(arc.end_date ?? arc.start_date).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / DAY_MS);
}

/** Occasions whose dates already span multiple days — misclassified durable chapters. */
export function multiDayOccasionCandidates(arcs: LifeArc[]): LifeArc[] {
  return arcs.filter((arc) => {
    if (arc.arc_type !== 'occasion') return false;
    const days = arcSpanDays(arc);
    return days != null && days >= 2;
  });
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function occasionDayKey(arc: LifeArc): string {
  const metaDay = (arc.metadata as { occasion_day?: unknown } | undefined)?.occasion_day;
  if (typeof metaDay === 'string' && metaDay) return metaDay.slice(0, 10);
  return (arc.start_date ?? '').slice(0, 10);
}

export type OccasionDuplicateGroup = {
  key: string;
  day: string;
  title: string;
  arcs: LifeArc[];
};

/** Same-day occasions with the same title — keep one, remove extras. */
export function duplicateOccasionGroups(arcs: LifeArc[]): OccasionDuplicateGroup[] {
  const buckets = new Map<string, LifeArc[]>();
  for (const arc of arcs) {
    if (arc.arc_type !== 'occasion') continue;
    const day = occasionDayKey(arc);
    if (!day) continue;
    const title = normalizeTitle(arc.title || '');
    const key = `${day}::${title}`;
    const list = buckets.get(key) ?? [];
    list.push(arc);
    buckets.set(key, list);
  }
  const groups: OccasionDuplicateGroup[] = [];
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    const [day, title] = key.split('::');
    groups.push({ key, day, title: title || 'Untitled occasion', arcs: list });
  }
  return groups.sort((a, b) => a.day.localeCompare(b.day));
}

export function defaultPromotionType(arc: LifeArc): Exclude<ArcType, 'occasion'> {
  if (arc.track === 'career') return 'work';
  if (arc.track === 'creative' || arc.track === 'health') return 'skill';
  if (arc.track === 'romance' || arc.track === 'relationships') return 'life_era';
  return 'life_era';
}

export function defaultPromotionTrack(arc: LifeArc): ArcTrack {
  return arc.track ?? 'inner';
}
