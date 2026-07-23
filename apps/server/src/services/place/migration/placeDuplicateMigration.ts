/**
 * Plan merges for obvious duplicate place cards (alias / near-identical titles).
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';

export type DuplicateMergePlan = {
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  reason: string;
};

export function planPlaceDuplicateMerges(
  places: Array<{ id: string; name: string; aliases?: string[] | null }>,
): DuplicateMergePlan[] {
  const plans: DuplicateMergePlan[] = [];
  const byKey = new Map<string, { id: string; name: string }>();

  for (const place of places) {
    const keys = [
      normalizeNameKey(place.name),
      ...(place.aliases ?? []).map((a) => normalizeNameKey(a)),
    ].filter(Boolean);

    let matched: { id: string; name: string } | undefined;
    for (const key of keys) {
      const hit = byKey.get(key);
      if (hit && hit.id !== place.id) {
        matched = hit;
        break;
      }
    }

    if (matched) {
      // Prefer longer / more formal survivor name.
      const preferCurrent = place.name.length > matched.name.length;
      plans.push({
        sourceId: preferCurrent ? matched.id : place.id,
        sourceName: preferCurrent ? matched.name : place.name,
        targetId: preferCurrent ? place.id : matched.id,
        targetName: preferCurrent ? place.name : matched.name,
        reason: 'alias_or_normalized_duplicate',
      });
    } else {
      for (const key of keys) {
        if (!byKey.has(key)) byKey.set(key, { id: place.id, name: place.name });
      }
    }
  }

  return plans;
}
