/**
 * Split fused place titles like "Catch One and Club Metro".
 */

import { detectCompoundPlaceNames } from '../../locations/placePresenceSemantics';
import { normalizeNameKey } from '../../../utils/nameNormalization';

export type CompositeSplitPlan = {
  compositeName: string;
  parts: Array<{ name: string; existingId?: string }>;
  archiveComposite: boolean;
};

export function planCompositeSplit(
  compositeName: string,
  knownPlaces: Array<{ id: string; name: string }> = [],
): CompositeSplitPlan | null {
  const parts = detectCompoundPlaceNames(compositeName);
  if (!parts) return null;

  const byKey = new Map(knownPlaces.map((p) => [normalizeNameKey(p.name), p]));

  return {
    compositeName,
    parts: parts.map((name) => {
      const hit = byKey.get(normalizeNameKey(name));
      return hit ? { name: hit.name, existingId: hit.id } : { name };
    }),
    archiveComposite: true,
  };
}
