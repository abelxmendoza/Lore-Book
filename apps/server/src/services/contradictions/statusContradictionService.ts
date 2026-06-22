import type { EvidenceBundle } from '../provenance/inference/provenanceInferenceTypes';
import type { ContradictionCandidate, StatusTransition } from './contradictionTypes';
import { buildContradictionCandidate } from './contradictionProvenanceService';

function extractStatus(text: string): string | null {
  if (/\bpaused\b|\bon hold\b|\bdormant\b/i.test(text)) return 'paused';
  if (/\bworking on\b|\bevery night\b|\bactive\b|\bresumed\b|\bstarted again\b/i.test(text)) return 'active';
  if (/\bformer\b|\bended\b|\bquit\b/i.test(text)) return 'former';
  return null;
}

function extractSubject(text: string): string | null {
  if (/\bLoreBook\b/i.test(text)) return 'LoreBook';
  const isPaused = text.match(/\b([A-Z][A-Za-z0-9\s'-]{2,30}?)\s+is\s+paused\b/i);
  if (isPaused) return isPaused[1].trim();
  const workingOn = text.match(/\bworking on\s+([A-Z][A-Za-z0-9\s'-]{2,30})\b/i);
  if (workingOn) return workingOn[1].trim();
  const m = text.match(/\b([A-Z][A-Za-z0-9\s'-]{2,30})\b/);
  return m?.[1]?.trim() ?? null;
}

export function detectStatusTransition(
  existing: EvidenceBundle,
  incoming: EvidenceBundle,
  seenAt?: string,
): StatusTransition | null {
  const subjectA = extractSubject(existing.claimText);
  const subjectB = extractSubject(incoming.claimText);
  if (!subjectA || !subjectB || subjectA.toLowerCase() !== subjectB.toLowerCase()) return null;

  const statusA = extractStatus(existing.claimText);
  const statusB = extractStatus(incoming.claimText);
  if (!statusA || !statusB || statusA === statusB) return null;

  const validTransition =
    (statusA === 'paused' && statusB === 'active') ||
    (statusA === 'active' && statusB === 'paused') ||
    (statusA === 'active' && statusB === 'former') ||
    (statusA === 'former' && statusB === 'active');

  if (!validTransition) return null;

  return {
    id: crypto.randomUUID(),
    entityOrSubject: subjectA,
    fromStatus: statusA,
    toStatus: statusB,
    existingClaim: existing,
    newClaim: incoming,
    isTransition: true,
    reason: `Status transition ${statusA} → ${statusB} (time explains change)`,
  };
}

export function detectStatusContradiction(
  existing: EvidenceBundle,
  incoming: EvidenceBundle,
  seenAt?: string,
): ContradictionCandidate | null {
  const transition = detectStatusTransition(existing, incoming, seenAt);
  if (transition) return null;

  const statusA = extractStatus(existing.claimText);
  const statusB = extractStatus(incoming.claimText);
  const subjectA = extractSubject(existing.claimText);
  const subjectB = extractSubject(incoming.claimText);
  if (!statusA || !statusB || statusA === statusB) return null;
  if (!subjectA || !subjectB || subjectA.toLowerCase() !== subjectB.toLowerCase()) return null;

  return buildContradictionCandidate(
    {
      contradictionType: 'status',
      existingClaim: existing,
      newClaim: incoming,
      severity: 'medium',
      suggestedResolution: 'needs_user_review',
      reason: `Unresolved status conflict for ${subjectA}: ${statusA} vs ${statusB}`,
    },
    seenAt,
  );
}

export function detectStatusEvents(
  existingClaims: EvidenceBundle[],
  incoming: EvidenceBundle,
  seenAt?: string,
): { contradictions: ContradictionCandidate[]; transitions: StatusTransition[] } {
  const contradictions: ContradictionCandidate[] = [];
  const transitions: StatusTransition[] = [];

  for (const existing of existingClaims) {
    const transition = detectStatusTransition(existing, incoming, seenAt);
    if (transition) {
      transitions.push(transition);
      continue;
    }
    const contradiction = detectStatusContradiction(existing, incoming, seenAt);
    if (contradiction) contradictions.push(contradiction);
  }

  return { contradictions, transitions };
}
