import type { EvidenceBundle } from '../provenance/inference/provenanceInferenceTypes';
import type { ContradictionCandidate, ContradictionSeverity, SuggestedResolution } from './contradictionTypes';
import { buildContradictionCandidate } from './contradictionProvenanceService';

function isStrongRelationship(text: string): boolean {
  return /\bbest friend\b|\bclose friend\b|\bpartner\b|\bboyfriend\b|\bgirlfriend\b/i.test(text);
}

function isWeakRelationship(text: string): boolean {
  return /\bbarely knew\b|\bdidn't really know\b|\bnot really friends\b|\bdistant\b/i.test(text);
}

export function detectRelationshipContradiction(
  existing: EvidenceBundle,
  incoming: EvidenceBundle,
  seenAt?: string,
): ContradictionCandidate | null {
  const sharedName = extractSharedPerson(existing.claimText, incoming.claimText);
  if (!sharedName) return null;

  const strongWeak =
    (isStrongRelationship(existing.claimText) && isWeakRelationship(incoming.claimText)) ||
    (isWeakRelationship(existing.claimText) && isStrongRelationship(incoming.claimText));

  const negFlip =
    /\bnot\b.*\bfriend\b/i.test(existing.claimText) !== /\bnot\b.*\bfriend\b/i.test(incoming.claimText);

  if (!strongWeak && !negFlip) return null;

  return buildContradictionCandidate(
    {
      contradictionType: 'relationship',
      existingClaim: existing,
      newClaim: incoming,
      severity: 'high',
      suggestedResolution: 'needs_user_review',
      reason: `Relationship tension for ${sharedName}: conflicting closeness`,
    },
    seenAt,
  );
}

function extractSharedPerson(a: string, b: string): string | null {
  const namesA = a.match(/[A-Z][a-z]+/g) ?? [];
  const namesB = b.match(/[A-Z][a-z]+/g) ?? [];
  const shared = namesA.find((n) => namesB.includes(n) && n.length > 2);
  return shared ?? null;
}

export function detectRelationshipContradictions(
  existingClaims: EvidenceBundle[],
  incoming: EvidenceBundle,
  seenAt?: string,
): ContradictionCandidate[] {
  const out: ContradictionCandidate[] = [];
  for (const existing of existingClaims) {
    if (existing.claimType !== 'relationship' && incoming.claimType !== 'relationship') {
      if (!/\bfriend\b/i.test(existing.claimText) && !/\bfriend\b/i.test(incoming.claimText)) continue;
    }
    const hit = detectRelationshipContradiction(existing, incoming, seenAt);
    if (hit) out.push(hit);
  }
  return out;
}
