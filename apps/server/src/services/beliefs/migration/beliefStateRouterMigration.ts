import type { BeliefQueueAuditRecord } from '../beliefTypes';

export function planTemporalStateRouting(records: BeliefQueueAuditRecord[]): BeliefQueueAuditRecord[] {
  return records.filter((r) => r.migrationDecision === 'ROUTE_TO_TEMPORAL_STATE');
}
