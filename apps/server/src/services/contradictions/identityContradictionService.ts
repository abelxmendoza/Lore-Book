import type { EvidenceBundle } from '../provenance/inference/provenanceInferenceTypes';
import type { ContradictionCandidate, ContradictionSeverity, SuggestedResolution } from './contradictionTypes';
import { buildContradictionCandidate } from './contradictionProvenanceService';

function extractIdentityRole(text: string): string | null {
  if (/\bis me\b|\bthat's me\b|\bI am\b/i.test(text) && !/\bfather\b|\bmother\b/i.test(text)) return 'self';
  if (/\bmy father\b|\bis my dad\b|\bis my father\b/i.test(text)) return 'father';
  if (/\bmy mother\b|\bis my mom\b|\bis my mother\b/i.test(text)) return 'mother';
  if (/\bmy brother\b/i.test(text)) return 'brother';
  if (/\bmy sister\b/i.test(text)) return 'sister';
  return null;
}

function extractName(text: string): string | null {
  const m = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
  return m?.[1]?.trim() ?? null;
}

export function detectIdentityContradiction(
  existing: EvidenceBundle,
  incoming: EvidenceBundle,
  seenAt?: string,
): ContradictionCandidate | null {
  const nameA = extractName(existing.claimText);
  const nameB = extractName(incoming.claimText);
  if (!nameA || !nameB || nameA.toLowerCase() !== nameB.toLowerCase()) return null;

  const roleA = extractIdentityRole(existing.claimText);
  const roleB = extractIdentityRole(incoming.claimText);
  if (!roleA || !roleB || roleA === roleB) return null;

  const severity: ContradictionSeverity =
    roleA === 'self' || roleB === 'self' || roleA === 'father' || roleB === 'father'
      ? 'critical'
      : 'high';

  return buildContradictionCandidate(
    {
      contradictionType: 'identity',
      existingClaim: existing,
      newClaim: incoming,
      severity,
      suggestedResolution: 'split_entities',
      reason: `Identity collision: ${nameA} as ${roleA} vs ${roleB}`,
    },
    seenAt,
  );
}

export function detectIdentityCollisions(
  existingClaims: EvidenceBundle[],
  incoming: EvidenceBundle,
  seenAt?: string,
): ContradictionCandidate[] {
  const out: ContradictionCandidate[] = [];
  for (const existing of existingClaims) {
    if (existing.claimType !== 'identity' && existing.claimType !== 'entity') continue;
    const hit = detectIdentityContradiction(existing, incoming, seenAt);
    if (hit) out.push(hit);
  }
  return out;
}
