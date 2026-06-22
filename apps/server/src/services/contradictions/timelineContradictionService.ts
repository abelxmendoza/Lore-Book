import type { EvidenceBundle } from '../provenance/inference/provenanceInferenceTypes';
import type { ContradictionCandidate, ContradictionSeverity } from './contradictionTypes';
import { buildContradictionCandidate } from './contradictionProvenanceService';

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function extractStartDate(text: string): { month?: number; label?: string } | null {
  const monthMatch = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
  if (monthMatch) {
    const month = MONTHS[monthMatch[1].toLowerCase()];
    return { month, label: monthMatch[1] };
  }
  return null;
}

function extractSubject(text: string): string | null {
  const m = text.match(/\b(?:started|start|joined|begin)\s+(?:at\s+)?([A-Z][A-Za-z0-9\s]+?)(?:\s+in|\s+on|$)/i);
  return m?.[1]?.trim() ?? null;
}

export function detectTimelineContradiction(
  existing: EvidenceBundle,
  incoming: EvidenceBundle,
  seenAt?: string,
): ContradictionCandidate | null {
  const subjectA = extractSubject(existing.claimText);
  const subjectB = extractSubject(incoming.claimText);
  if (!subjectA || !subjectB || subjectA.toLowerCase() !== subjectB.toLowerCase()) return null;

  const dateA = extractStartDate(existing.claimText);
  const dateB = extractStartDate(incoming.claimText);
  if (!dateA?.month || !dateB?.month || dateA.month === dateB.month) return null;

  const severity: ContradictionSeverity = /\bAmazon\b|\bGoogle\b|\bwork\b/i.test(existing.claimText)
    ? 'high'
    : 'medium';

  return buildContradictionCandidate(
    {
      contradictionType: 'timeline',
      existingClaim: existing,
      newClaim: incoming,
      severity,
      suggestedResolution: 'mark_time_bounded',
      reason: `Timeline conflict for ${subjectA}: ${dateA.label} vs ${dateB.label} — correct date, different event, or offer vs start?`,
    },
    seenAt,
  );
}

function extractEmployer(text: string): string | null {
  const m = text.match(/\b(?:work|worked|working)\s+(?:at|for)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)?)/i);
  return m?.[1]?.trim() ?? null;
}

export function detectEmploymentContradiction(
  existing: EvidenceBundle,
  incoming: EvidenceBundle,
  seenAt?: string,
): ContradictionCandidate | null {
  const workA = extractEmployer(existing.claimText);
  const workB = extractEmployer(incoming.claimText);
  if (!workA || !workB || workA.toLowerCase() === workB.toLowerCase()) return null;

  const formerContext = /\b(?:used to work|former employer|left|quit|no longer work)\b/i.test(
    `${existing.claimText} ${incoming.claimText}`,
  );
  if (formerContext) return null;

  const futureContext = /\b(?:offer|will start|starting soon|future)\b/i.test(incoming.claimText);
  const resolution = futureContext ? 'mark_time_bounded' : 'needs_user_review';

  return buildContradictionCandidate(
    {
      contradictionType: 'employment',
      existingClaim: existing,
      newClaim: incoming,
      severity: 'critical',
      suggestedResolution: resolution,
      reason: `Employment overlap: ${workA} vs ${workB} — check former/current/future context`,
    },
    seenAt,
  );
}

export function detectTimelineContradictions(
  existingClaims: EvidenceBundle[],
  incoming: EvidenceBundle,
  seenAt?: string,
): ContradictionCandidate[] {
  const out: ContradictionCandidate[] = [];
  for (const existing of existingClaims) {
    const timeline = detectTimelineContradiction(existing, incoming, seenAt);
    if (timeline) out.push(timeline);
    const employment = detectEmploymentContradiction(existing, incoming, seenAt);
    if (employment) out.push(employment);
  }
  return out;
}
