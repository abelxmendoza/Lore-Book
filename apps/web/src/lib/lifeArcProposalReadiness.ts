import type { LifeArcProposal } from '../hooks/useLifeArcProposals';

const DAY_MS = 86_400_000;

/** Mirrors server thresholds in lifeArcProposalService. */
export const AUTO_CREATE_MIN_CONFIDENCE = 0.75;
export const AUTO_CREATE_MIN_SPAN_DAYS = 14;
export const AUTO_CREATE_MIN_EVIDENCE = 2;
export const AUTO_CREATE_STRONG_EVIDENCE = 3;

export function proposalSpanDays(proposal: Pick<LifeArcProposal, 'start_date' | 'end_date'>): number {
  const start = new Date(proposal.start_date).getTime();
  const end = new Date(proposal.end_date).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / DAY_MS);
}

/** High-signal proposals LoreBook can materialize without per-card review. */
export function isProposalReadyForAutoCreate(
  proposal: Pick<LifeArcProposal, 'confidence' | 'start_date' | 'end_date' | 'evidence'>,
): boolean {
  if (proposal.confidence < AUTO_CREATE_MIN_CONFIDENCE) return false;
  if (proposal.evidence.length < AUTO_CREATE_MIN_EVIDENCE) return false;
  const spanDays = proposalSpanDays(proposal);
  if (spanDays < 2) return false;
  if (spanDays < AUTO_CREATE_MIN_SPAN_DAYS && proposal.evidence.length < AUTO_CREATE_STRONG_EVIDENCE) {
    return false;
  }
  return true;
}

export function countReadyProposals(proposals: LifeArcProposal[]): number {
  return proposals.filter((proposal) => isProposalReadyForAutoCreate(proposal)).length;
}
