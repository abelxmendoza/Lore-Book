import type {
  ConsolidationContradiction,
  ConsolidationEvidenceFragment,
} from './consolidationTypes';
import { normalizeClaimKey } from './consolidationTypes';

function normalize(text: string): string {
  return normalizeClaimKey(text);
}

export function fragmentsContradict(a: ConsolidationEvidenceFragment, b: ConsolidationEvidenceFragment): boolean {
  if (normalize(a.claimKey) === normalize(b.claimKey)) return false;
  if (a.entityNames[0] && b.entityNames[0] && normalize(a.entityNames[0]) !== normalize(b.entityNames[0])) {
    return false;
  }

  const sharedEntity = a.entityNames.some((n) =>
    b.entityNames.some((m) => normalize(n) === normalize(m)),
  );
  if (!sharedEntity && a.claimKey !== b.claimKey) return false;

  const negA = /\bnot\b|\bwasn't\b|\benemy\b/i.test(a.text);
  const negB = /\bnot\b|\bwasn't\b|\benemy\b/i.test(b.text);
  if (negA !== negB) return true;

  if (a.relationshipLabels.length && b.relationshipLabels.length) {
    const setA = new Set(a.relationshipLabels.map(normalize));
    const setB = new Set(b.relationshipLabels.map(normalize));
    const overlap = [...setA].some((l) => setB.has(l));
    if (overlap && normalize(a.text) !== normalize(b.text)) return true;
  }

  return sharedEntity && normalize(a.text) !== normalize(b.text) && (negA || negB);
}

export function findContradictionsInGroup(
  fragments: ConsolidationEvidenceFragment[],
  subjectKey: string,
): ConsolidationContradiction | null {
  for (let i = 0; i < fragments.length; i++) {
    for (let j = i + 1; j < fragments.length; j++) {
      if (fragmentsContradict(fragments[i], fragments[j])) {
        return {
          id: crypto.randomUUID(),
          subjectKey,
          fragmentIds: [fragments[i].id, fragments[j].id],
          conflictingTexts: [fragments[i].text, fragments[j].text],
          reason: 'conflicting_evidence',
          requiresReview: true,
        };
      }
    }
  }
  return null;
}

export function splitContradictoryGroups(
  groups: Map<string, ConsolidationEvidenceFragment[]>,
): {
  safeGroups: Map<string, ConsolidationEvidenceFragment[]>;
  contradictions: ConsolidationContradiction[];
} {
  const safeGroups = new Map<string, ConsolidationEvidenceFragment[]>();
  const contradictions: ConsolidationContradiction[] = [];

  for (const [key, frags] of groups) {
    const contradiction = findContradictionsInGroup(frags, key);
    if (contradiction) {
      contradictions.push(contradiction);
    } else {
      safeGroups.set(key, frags);
    }
  }

  return { safeGroups, contradictions };
}
