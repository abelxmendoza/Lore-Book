import { normalizePersonNameKey } from '../../../utils/personNameValidation';
import type { CharacterCandidate } from './characterInferenceTypes';
import { provenanceOverlap } from './characterProvenanceService';

export function sameAmbiguousIdentity(a: CharacterCandidate, b: CharacterCandidate): boolean {
  if (normalizePersonNameKey(a.displayName) === normalizePersonNameKey(b.displayName)) {
    return provenanceOverlap(a, b) || a.sourceMessageIds.some((id) => b.sourceMessageIds.includes(id));
  }

  const aRole = a.titleParts?.roleTitle?.toLowerCase();
  const bRole = b.titleParts?.roleTitle?.toLowerCase();
  if (aRole && bRole && aRole === bRole) {
    return provenanceOverlap(a, b);
  }

  return false;
}

export function shouldMergeAmbiguousCandidates(
  a: CharacterCandidate,
  b: CharacterCandidate,
): boolean {
  if (!a.needsResolution || !b.needsResolution) return false;
  return sameAmbiguousIdentity(a, b);
}

export function mergeCandidates(base: CharacterCandidate, incoming: CharacterCandidate): CharacterCandidate {
  return {
    ...base,
    aliases: [...new Set([...base.aliases, ...incoming.aliases, incoming.displayName])],
    evidencePhrases: [...new Set([...base.evidencePhrases, ...incoming.evidencePhrases])],
    sourceMessageIds: [...new Set([...base.sourceMessageIds, ...incoming.sourceMessageIds])],
    confidence: Math.max(base.confidence, incoming.confidence),
    context: { ...base.context, ...incoming.context },
  };
}

export function dedupeAmbiguousCandidates(candidates: CharacterCandidate[]): CharacterCandidate[] {
  const out: CharacterCandidate[] = [];
  for (const candidate of candidates) {
    const sameNameIdx = out.findIndex(
      (existing) =>
        normalizePersonNameKey(existing.displayName) === normalizePersonNameKey(candidate.displayName),
    );
    if (sameNameIdx >= 0) {
      const existing = out[sameNameIdx];
      const preferred = preferCandidateType(existing, candidate);
      const other = preferred === existing ? candidate : existing;
      out[sameNameIdx] = mergeCandidates(preferred, other);
      continue;
    }

    const idx = out.findIndex((existing) => shouldMergeAmbiguousCandidates(existing, candidate));
    if (idx >= 0) {
      out[idx] = mergeCandidates(out[idx], candidate);
    } else {
      out.push(candidate);
    }
  }
  return out;
}

const IDENTITY_PRIORITY: Record<CharacterCandidate['identityType'], number> = {
  family_title_name: 90,
  honorific_name: 85,
  stage_name: 80,
  nickname: 75,
  role_contextual: 70,
  ambiguous_contextual: 65,
  partial_name: 60,
  full_name: 50,
  unnamed_reference: 40,
};

function preferCandidateType(a: CharacterCandidate, b: CharacterCandidate): CharacterCandidate {
  const aScore = IDENTITY_PRIORITY[a.identityType] ?? 0;
  const bScore = IDENTITY_PRIORITY[b.identityType] ?? 0;
  return bScore > aScore ? b : a;
}

/** Do not merge different context anchors (e.g. Ska Prom vs Club Metro). */
export function areDistinctContextualPeople(a: CharacterCandidate, b: CharacterCandidate): boolean {
  const aKey = normalizePersonNameKey(a.displayName);
  const bKey = normalizePersonNameKey(b.displayName);
  if (aKey === bKey) return false;
  if (!a.displayName.toLowerCase().includes('new guy') || !b.displayName.toLowerCase().includes('new guy')) {
    return false;
  }
  return !provenanceOverlap(a, b);
}
