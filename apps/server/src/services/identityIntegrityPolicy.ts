/**
 * Identity Integrity Policy — single source of truth for when two labels
 * refer to the *same* LoreBook entity vs merely similar.
 *
 * Auto-merge is allowed ONLY at `identity_equivalent` (all required criteria pass).
 * Partial overlap → `similar` (surface hint, keep suggestion).
 * No signal → `distinct` (new suggestion).
 */

import { kinshipRoleKey, matchCharacterNames, parseCharacterName } from '../utils/characterNameMatching';
import { normalizeNameKey, containmentIsPossessive } from '../utils/nameNormalization';
import { canonicalProjectKey } from './lexical/projects/projectDeduplicationService';
import { canonicalVenueName } from './ontology/placeIntelligence';

export type IdentityTier = 'identity_equivalent' | 'similar' | 'distinct';

/** Criteria that must ALL pass for silent auto-merge. */
export type IdentityCriteria = {
  /** Normalized/canonical string identity (exact key match). */
  canonicalMatch: boolean;
  /** Known alias on the target entity, or title-aware exact character match. */
  aliasOrExactLabel: boolean;
  /** No possessive/containment ambiguity (e.g. "Kelly's colleague" ≠ Kelly). */
  noPossessiveConflict: boolean;
  /** At most one viable candidate — no tie within disambiguation margin. */
  uniqueCandidate: boolean;
};

export type IdentityVerdict = {
  tier: IdentityTier;
  confidence: number;
  method?: string;
  criteria: IdentityCriteria;
  reasons: string[];
};

export type IdentityCandidate = {
  id: string;
  name: string;
  aliases?: string[];
};

const DISAMBIGUATION_MARGIN = 0.12;

function baseCriteria(): IdentityCriteria {
  return {
    canonicalMatch: false,
    aliasOrExactLabel: false,
    noPossessiveConflict: true,
    uniqueCandidate: true,
  };
}

function possessiveConflict(a: string, b: string): boolean {
  const na = normalizeNameKey(a);
  const nb = normalizeNameKey(b);
  return containmentIsPossessive(na, nb) || containmentIsPossessive(nb, na);
}

function buildEquivalentVerdict(method: string, criteria: IdentityCriteria): IdentityVerdict {
  return { tier: 'identity_equivalent', confidence: 1, method, criteria, reasons: [] };
}

function buildSimilarVerdict(
  confidence: number,
  method: string,
  criteria: IdentityCriteria,
  reason: string
): IdentityVerdict {
  return { tier: 'similar', confidence, method, criteria, reasons: [reason] };
}

/** Characters: identity-equivalent ONLY on exact normalized label, known alias, or kinship-role synonym. */
export function evaluateCharacterIdentity(
  incoming: string,
  candidates: IdentityCandidate[]
): { verdict: IdentityVerdict; matched?: IdentityCandidate } {
  const incomingKey = normalizeNameKey(incoming);
  const hits: Array<{ candidate: IdentityCandidate; verdict: IdentityVerdict }> = [];

  for (const candidate of candidates) {
    const labels = [candidate.name, ...(candidate.aliases ?? [])];

    for (const label of labels) {
      if (normalizeNameKey(label) === incomingKey) {
        const criteria: IdentityCriteria = {
          canonicalMatch: normalizeNameKey(candidate.name) === incomingKey,
          aliasOrExactLabel: true,
          noPossessiveConflict: !possessiveConflict(incoming, label),
          uniqueCandidate: true,
        };
        if (Object.values(criteria).every(Boolean)) {
          hits.push({
            candidate,
            verdict: buildEquivalentVerdict(
              normalizeNameKey(candidate.name) === incomingKey ? 'exact' : 'alias',
              criteria
            ),
          });
        }
      }
    }

    if (hits.some((h) => h.candidate.id === candidate.id)) continue;

    const parsedIncoming = parseCharacterName(incoming);
    const parsedCandidate = parseCharacterName(candidate.name);
    const incomingRole = parsedIncoming.kinshipRole ?? kinshipRoleKey(incoming);
    const candidateRole = parsedCandidate.kinshipRole ?? kinshipRoleKey(candidate.name);

    if (
      incomingRole &&
      candidateRole &&
      incomingRole === candidateRole &&
      !parsedIncoming.coreName &&
      !parsedCandidate.coreName
    ) {
      const criteria: IdentityCriteria = {
        canonicalMatch: false,
        aliasOrExactLabel: true,
        noPossessiveConflict: true,
        uniqueCandidate: true,
      };
      hits.push({ candidate, verdict: buildEquivalentVerdict('kinship_role', criteria) });
      continue;
    }

    const match = matchCharacterNames(incoming, candidate.name);
    if (match.matches && match.method !== 'exact' && match.method !== 'kinship_role') {
      const criteria = {
        ...baseCriteria(),
        noPossessiveConflict: !possessiveConflict(incoming, candidate.name),
      };
      hits.push({
        candidate,
        verdict: buildSimilarVerdict(
          match.confidence,
          match.method,
          criteria,
          `Similar to “${candidate.name}” (${match.method}) — not treated as the same person.`
        ),
      });
    }
  }

  if (hits.length === 0) {
    return { verdict: { tier: 'distinct', confidence: 0, criteria: baseCriteria(), reasons: [] } };
  }

  const equivalent = hits.filter((h) => h.verdict.tier === 'identity_equivalent');
  if (equivalent.length === 1) {
    return { matched: equivalent[0].candidate, verdict: equivalent[0].verdict };
  }
  if (equivalent.length > 1) {
    return {
      matched: equivalent[0].candidate,
      verdict: {
        tier: 'similar',
        confidence: 0.75,
        method: 'ambiguous',
        criteria: { ...baseCriteria(), uniqueCandidate: false },
        reasons: ['Multiple characters share this identity — pick which one.'],
      },
    };
  }

  hits.sort((a, b) => b.verdict.confidence - a.verdict.confidence);
  const top = hits[0];
  const second = hits[1];
  if (second && top.verdict.confidence - second.verdict.confidence < DISAMBIGUATION_MARGIN) {
    return {
      matched: top.candidate,
      verdict: {
        ...top.verdict,
        criteria: { ...top.verdict.criteria, uniqueCandidate: false },
        reasons: [...top.verdict.reasons, 'Multiple similar characters — not auto-merging.'],
      },
    };
  }

  return { matched: top.candidate, verdict: top.verdict };
}

function evaluateExactKeyIdentity(
  incoming: string,
  candidates: IdentityCandidate[],
  keyFn: (name: string) => string = normalizeNameKey
): { verdict: IdentityVerdict; matched?: IdentityCandidate } {
  const incomingKey = keyFn(incoming.trim());
  if (!incomingKey) {
    return { verdict: { tier: 'distinct', confidence: 0, criteria: baseCriteria(), reasons: [] } };
  }

  let matched: IdentityCandidate | undefined;
  for (const candidate of candidates) {
    if (keyFn(candidate.name) === incomingKey) {
      matched = candidate;
      break;
    }
    for (const alias of candidate.aliases ?? []) {
      if (keyFn(alias) === incomingKey) {
        matched = candidate;
        break;
      }
    }
    if (matched) break;
  }

  if (!matched) {
    return { verdict: { tier: 'distinct', confidence: 0, criteria: baseCriteria(), reasons: [] } };
  }

  const criteria: IdentityCriteria = {
    canonicalMatch: true,
    aliasOrExactLabel: true,
    noPossessiveConflict: !possessiveConflict(incoming, matched.name),
    uniqueCandidate: true,
  };

  if (!Object.values(criteria).every(Boolean)) {
    return {
      matched,
      verdict: buildSimilarVerdict(0.8, 'exact_with_conflict', criteria, 'Name matches but phrasing is ambiguous.'),
    };
  }

  return {
    matched,
    verdict: buildEquivalentVerdict('exact', criteria),
  };
}

export function evaluateProjectIdentity(incoming: string, candidates: IdentityCandidate[]) {
  return evaluateExactKeyIdentity(incoming, candidates, canonicalProjectKey);
}

export function evaluateSkillIdentity(incoming: string, candidates: IdentityCandidate[]) {
  return evaluateExactKeyIdentity(incoming, candidates, normalizeNameKey);
}

export function evaluateQuestIdentity(incoming: string, candidates: IdentityCandidate[]) {
  return evaluateExactKeyIdentity(incoming, candidates, normalizeNameKey);
}

/** Places: exact normalized name OR identical canonical venue key only. */
export function evaluateLocationIdentity(incoming: string, candidates: IdentityCandidate[]) {
  const exact = evaluateExactKeyIdentity(incoming, candidates, normalizeNameKey);
  if (exact.verdict.tier === 'identity_equivalent') return exact;

  const venueKey = normalizeNameKey(canonicalVenueName(incoming));
  for (const candidate of candidates) {
    if (normalizeNameKey(canonicalVenueName(candidate.name)) !== venueKey) continue;
    const criteria: IdentityCriteria = {
      canonicalMatch: true,
      aliasOrExactLabel: true,
      noPossessiveConflict: true,
      uniqueCandidate: true,
    };
    return {
      matched: candidate,
      verdict: buildEquivalentVerdict('canonical_venue', criteria),
    };
  }

  return exact;
}

export function evaluateOrganizationIdentity(incoming: string, candidates: IdentityCandidate[]) {
  return evaluateExactKeyIdentity(incoming, candidates, normalizeNameKey);
}

export function identityTierToRedirectDisposition(
  tier: IdentityTier
): 'auto_merged' | 'suggested' | 'uncertain' {
  switch (tier) {
    case 'identity_equivalent':
      return 'auto_merged';
    case 'similar':
      return 'uncertain';
    default:
      return 'suggested';
  }
}
