import type { BeliefQueueAuditRecord } from '../beliefTypes';

export function planAttributionRepairs(records: BeliefQueueAuditRecord[]): BeliefQueueAuditRecord[] {
  return records.filter((r) =>
    r.proposedDomain === 'ALLEGATION'
    || r.compiledProposition?.attribution?.status === 'ALLEGATION'
  );
}
