import { matchCharacterName } from '../../../utils/characterNameMatching';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { CharacterCardAuditInput, MergeCandidateRef } from './characterCardAuditTypes';
import { evaluateBrokenPossessive } from './brokenPossessiveNameGuard';
import { scanProvenance } from './contextualReferenceRepairService';

export type MergeCandidatePair = {
  leftId: string;
  rightId: string;
  leftTitle: string;
  rightTitle: string;
  overlapScore: number;
  reason: string;
  autoMerge: boolean;
};

/** Stage-name / alias overlap pairs (Ashley ↔ Hell Fairy). */
const KNOWN_ALIAS_PAIRS: Array<[RegExp, RegExp]> = [
  [/^(?:hell\s+fairy|ashley)$/i, /^(?:hell\s+fairy|ashley)$/i],
];

function provenanceOverlap(a: string, b: string): number {
  if (!a.trim() || !b.trim()) return 0;
  const sa = scanProvenance(a);
  const sb = scanProvenance(b);
  let score = 0;
  const sharedEvents = sa.linkedEvents.filter((e) => sb.linkedEvents.includes(e));
  const sharedPlaces = sa.linkedPlaces.filter((p) => sb.linkedPlaces.includes(p));
  const sharedPeople = sa.linkedPeople.filter((p) => sb.linkedPeople.includes(p));
  if (sharedEvents.length) score += 0.35 * sharedEvents.length;
  if (sharedPlaces.length) score += 0.25 * sharedPlaces.length;
  if (sharedPeople.length) score += 0.15 * sharedPeople.length;
  return Math.min(1, score);
}

export function findMergeCandidatesForCharacter(
  target: CharacterCardAuditInput,
  roster: CharacterCardAuditInput[],
  provenanceById: Map<string, string>,
): MergeCandidateRef[] {
  const candidates: MergeCandidateRef[] = [];
  const targetProv = provenanceById.get(target.id) ?? '';

  const possessive = evaluateBrokenPossessive(
    target.name,
    roster.map((r) => ({ id: r.id, name: r.name })),
  );
  if (possessive.isBroken && possessive.baseName) {
    const base = roster.find(
      (r) => normalizeNameKey(r.name) === normalizeNameKey(possessive.baseName!),
    );
    if (base && base.id !== target.id) {
      candidates.push({
        characterId: base.id,
        currentTitle: base.name,
        overlapScore: 0.95,
        reason: 'Broken possessive span — merge into base identity',
      });
    }
  }

  for (const other of roster) {
    if (other.id === target.id) continue;
    const direct = matchCharacterName(target.name, other.name);
    if (direct.matches && direct.confidence >= 0.9) {
      candidates.push({
        characterId: other.id,
        currentTitle: other.name,
        overlapScore: direct.confidence,
        reason: direct.reason ?? 'Name/alias match',
      });
      continue;
    }

    for (const alias of other.alias ?? []) {
      const aliasMatch = matchCharacterName(target.name, alias);
      if (aliasMatch.matches) {
        candidates.push({
          characterId: other.id,
          currentTitle: other.name,
          overlapScore: aliasMatch.confidence,
          reason: `Alias overlap: ${alias}`,
        });
      }
    }

    const otherProv = provenanceById.get(other.id) ?? '';
    const overlap = provenanceOverlap(targetProv, otherProv);

    const targetKey = normalizeNameKey(target.name);
    const otherKey = normalizeNameKey(other.name);
    const isKnownAliasPair = KNOWN_ALIAS_PAIRS.some(
      ([a, b]) => a.test(targetKey) && b.test(otherKey),
    );

    if (isKnownAliasPair && overlap >= 0.25) {
      candidates.push({
        characterId: other.id,
        currentTitle: other.name,
        overlapScore: 0.7 + overlap * 0.2,
        reason: 'Possible stage-name / given-name alias with shared provenance',
      });
    }
  }

  return candidates.sort((a, b) => b.overlapScore - a.overlapScore);
}

export function shouldAutoMergePair(
  left: CharacterCardAuditInput,
  right: CharacterCardAuditInput,
  provenanceById: Map<string, string>,
): MergeCandidatePair | null {
  const leftProv = provenanceById.get(left.id) ?? '';
  const rightProv = provenanceById.get(right.id) ?? '';

  // Same role label but different environments → keep separate
  if (/^new guy$/i.test(left.name.trim()) && /^new guy$/i.test(right.name.trim())) {
    const l = scanProvenance(leftProv);
    const r = scanProvenance(rightProv);
    const leftEvent = l.linkedEvents[0] ?? '';
    const rightEvent = r.linkedEvents[0] ?? '';
    if (leftEvent && rightEvent && leftEvent !== rightEvent) {
      return {
        leftId: left.id,
        rightId: right.id,
        leftTitle: left.name,
        rightTitle: right.name,
        overlapScore: 0.2,
        reason: `Different event context (${leftEvent} vs ${rightEvent}) — do not auto-merge`,
        autoMerge: false,
      };
    }
  }

  const possessive = evaluateBrokenPossessive(left.name, [{ id: right.id, name: right.name }]);
  if (possessive.isBroken && possessive.baseName) {
    return {
      leftId: left.id,
      rightId: right.id,
      leftTitle: left.name,
      rightTitle: right.name,
      overlapScore: 0.95,
      reason: 'Broken possessive merges into base card',
      autoMerge: true,
    };
  }

  return null;
}
