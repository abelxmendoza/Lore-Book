import type { BeliefQueueAuditRecord } from '../beliefTypes';

export function planCorrectionRepairs(records: BeliefQueueAuditRecord[]): BeliefQueueAuditRecord[] {
  return records.filter((r) =>
    r.migrationDecision === 'RESOLVE_CORRECTION_TARGET'
    || r.migrationDecision === 'ADD_NEGATIVE_CONSTRAINT'
  );
}
