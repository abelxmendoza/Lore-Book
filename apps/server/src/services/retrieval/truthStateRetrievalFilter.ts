import type { RetrievalMemoryRecord, RetrievalTruthRank } from './retrievalTypes';
import { TRUTH_RANK_WEIGHT, truthStateToRetrievalRank } from './retrievalTypes';

const BLOCKED_TRUTH_STATES = new Set(['rejected']);

export function shouldFilterRecord(record: RetrievalMemoryRecord): boolean {
  return BLOCKED_TRUTH_STATES.has(record.provenance.truthState);
}

export function isSupersededRecord(
  record: RetrievalMemoryRecord,
  allRecords: RetrievalMemoryRecord[],
): boolean {
  if (!record.supersededById) return false;
  return allRecords.some(
    (r) => r.id === record.supersededById && r.provenance.truthState !== 'rejected',
  );
}

export function filterForRecall(records: RetrievalMemoryRecord[]): {
  kept: RetrievalMemoryRecord[];
  filteredRejected: number;
  filteredSuperseded: number;
} {
  let filteredRejected = 0;
  let filteredSuperseded = 0;

  const withoutRejected = records.filter((r) => {
    if (shouldFilterRecord(r)) {
      filteredRejected++;
      return false;
    }
    return true;
  });

  const kept = withoutRejected.filter((r) => {
    if (isSupersededRecord(r, withoutRejected)) {
      filteredSuperseded++;
      return false;
    }
    return true;
  });

  return { kept, filteredRejected, filteredSuperseded };
}

export function truthRankForRecord(record: RetrievalMemoryRecord): RetrievalTruthRank {
  return truthStateToRetrievalRank(
    record.provenance.truthState,
    undefined,
    record.frequency,
  );
}

export function truthRankWeight(record: RetrievalMemoryRecord): number {
  const rank = truthRankForRecord(record);
  return TRUTH_RANK_WEIGHT[rank];
}

export function compareTruthRank(a: RetrievalMemoryRecord, b: RetrievalMemoryRecord): number {
  return truthRankWeight(b) - truthRankWeight(a);
}

export function isSensitiveRecall(record: RetrievalMemoryRecord): boolean {
  return record.sensitiveCategories.length > 0;
}

export function requiresCarefulPhrasing(record: RetrievalMemoryRecord): boolean {
  if (!isSensitiveRecall(record)) return false;
  return (
    record.provenance.truthState === 'review_required' ||
    record.provenance.truthState === 'candidate' ||
    record.provenance.truthState === 'inferred'
  );
}

export function preferCorrectedVersion(
  records: RetrievalMemoryRecord[],
): RetrievalMemoryRecord[] {
  const correctedIds = new Set(
    records.filter((r) => r.correctedFromId).map((r) => r.correctedFromId!),
  );
  return records.filter((r) => !correctedIds.has(r.id));
}
