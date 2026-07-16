/**
 * Metrics for stage-level candidate contracts (entity/relationship/event/MRQ).
 */

export type StageCandidateKind =
  | 'entity_candidate'
  | 'relationship_candidate'
  | 'event_candidate'
  | 'memory_proposal'
  | 'correction_mutation'
  | 'retraction_mutation';

export type StageOutcome =
  | 'produced'
  | 'validated'
  | 'accepted'
  | 'rejected'
  | 'retyped'
  | 'persisted'
  | 'quarantined';

type Bucket = {
  produced: number;
  validated: number;
  accepted: number;
  rejected: number;
  retyped: number;
  persisted: number;
  quarantined: number;
  by_rejection_reason: Record<string, number>;
};

const emptyBucket = (): Bucket => ({
  produced: 0,
  validated: 0,
  accepted: 0,
  rejected: 0,
  retyped: 0,
  persisted: 0,
  quarantined: 0,
  by_rejection_reason: {},
});

const byKind: Record<string, Bucket> = {};

function bucket(kind: StageCandidateKind): Bucket {
  if (!byKind[kind]) byKind[kind] = emptyBucket();
  return byKind[kind];
}

export function recordStageCandidate(
  kind: StageCandidateKind,
  outcome: StageOutcome,
  reason?: string,
): void {
  const b = bucket(kind);
  if (outcome === 'produced') b.produced += 1;
  else if (outcome === 'validated') b.validated += 1;
  else if (outcome === 'accepted') b.accepted += 1;
  else if (outcome === 'rejected') {
    b.rejected += 1;
    if (reason) b.by_rejection_reason[reason] = (b.by_rejection_reason[reason] ?? 0) + 1;
  } else if (outcome === 'retyped') {
    b.retyped += 1;
    if (reason) b.by_rejection_reason[`retyped:${reason}`] = (b.by_rejection_reason[`retyped:${reason}`] ?? 0) + 1;
  } else if (outcome === 'persisted') b.persisted += 1;
  else if (outcome === 'quarantined') {
    b.quarantined += 1;
    if (reason) b.by_rejection_reason[`quarantine:${reason}`] = (b.by_rejection_reason[`quarantine:${reason}`] ?? 0) + 1;
  }
}

export function getStageContractMetrics(): Record<string, Bucket> {
  const out: Record<string, Bucket> = {};
  for (const [k, v] of Object.entries(byKind)) {
    out[k] = {
      ...v,
      by_rejection_reason: { ...v.by_rejection_reason },
    };
  }
  return out;
}

export function resetStageContractMetricsForTests(): void {
  for (const k of Object.keys(byKind)) delete byKind[k];
}
