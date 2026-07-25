import type { BeliefQueueAuditRecord } from '../beliefTypes';

export function planEventRouting(records: BeliefQueueAuditRecord[]): BeliefQueueAuditRecord[] {
  return records.filter((r) => r.migrationDecision === 'ROUTE_TO_EVENT');
}
