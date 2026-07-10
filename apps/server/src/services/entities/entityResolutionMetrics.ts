export type EntityResolutionMetric =
  | 'cross_type_candidates_retrieved'
  | 'cross_type_candidates_rejected'
  | 'merge_authorization_failures'
  | 'merge_attempts_blocked'
  | 'resolution_abstentions'
  | 'provisional_entities_created'
  | 'suspicious_persisted_merges_detected'
  | 'repairs_proposed'
  | 'repairs_executed'
  | 'repairs_requiring_review';

const counters = new Map<EntityResolutionMetric, number>();

export function incrementEntityResolutionMetric(metric: EntityResolutionMetric, amount = 1): void {
  counters.set(metric, (counters.get(metric) ?? 0) + amount);
}

export function getEntityResolutionMetrics(): Record<EntityResolutionMetric, number> {
  return {
    cross_type_candidates_retrieved: counters.get('cross_type_candidates_retrieved') ?? 0,
    cross_type_candidates_rejected: counters.get('cross_type_candidates_rejected') ?? 0,
    merge_authorization_failures: counters.get('merge_authorization_failures') ?? 0,
    merge_attempts_blocked: counters.get('merge_attempts_blocked') ?? 0,
    resolution_abstentions: counters.get('resolution_abstentions') ?? 0,
    provisional_entities_created: counters.get('provisional_entities_created') ?? 0,
    suspicious_persisted_merges_detected: counters.get('suspicious_persisted_merges_detected') ?? 0,
    repairs_proposed: counters.get('repairs_proposed') ?? 0,
    repairs_executed: counters.get('repairs_executed') ?? 0,
    repairs_requiring_review: counters.get('repairs_requiring_review') ?? 0,
  };
}

export function resetEntityResolutionMetricsForTests(): void {
  counters.clear();
}
