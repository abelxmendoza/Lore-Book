import type { CharacterCardAuditInput } from './characterCardAuditTypes';
import { scanProvenance } from './contextualReferenceRepairService';

export type IdentityIntegrityVerdict = {
  samePerson: boolean;
  confidence: number;
  reason: string;
  keepSeparate: boolean;
};

/**
 * Compare two ambiguous character cards before merge/rename.
 * Requires provenance overlap — role similarity alone is insufficient.
 */
export function compareAmbiguousIdentities(
  left: CharacterCardAuditInput,
  right: CharacterCardAuditInput,
  leftProvenance: string,
  rightProvenance: string,
): IdentityIntegrityVerdict {
  const l = scanProvenance(leftProvenance);
  const r = scanProvenance(rightProvenance);

  const sharedEvents = l.linkedEvents.filter((e) => r.linkedEvents.includes(e));
  const sharedPlaces = l.linkedPlaces.filter((p) => r.linkedPlaces.includes(p));
  const sharedPeople = l.linkedPeople.filter((p) => r.linkedPeople.includes(p));

  if (sharedEvents.length === 0 && sharedPlaces.length === 0 && sharedPeople.length <= 1) {
    return {
      samePerson: false,
      confidence: 0.15,
      reason: 'Insufficient provenance overlap — keep separate ambiguous identities',
      keepSeparate: true,
    };
  }

  const score =
    sharedEvents.length * 0.35 +
    sharedPlaces.length * 0.3 +
    Math.max(0, sharedPeople.length - 1) * 0.1;

  if (score >= 0.5) {
    return {
      samePerson: true,
      confidence: Math.min(0.95, score),
      reason: `Shared story context: ${[...sharedEvents, ...sharedPlaces].join(', ') || 'linked people'}`,
      keepSeparate: false,
    };
  }

  return {
    samePerson: false,
    confidence: score,
    reason: 'Some overlap but not enough for identity merge',
    keepSeparate: true,
  };
}
