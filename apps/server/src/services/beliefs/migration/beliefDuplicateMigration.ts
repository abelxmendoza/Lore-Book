import type { BeliefQueueAuditRecord } from '../beliefTypes';

export function planBeliefDuplicateMerges(records: BeliefQueueAuditRecord[]): Array<{
  keepId: string;
  mergeIds: string[];
  reason: string;
}> {
  const byKey = new Map<string, BeliefQueueAuditRecord[]>();
  for (const record of records) {
    const key = [
      record.compiledProposition?.subject.displayName,
      record.compiledProposition?.predicate,
      record.compiledProposition?.object?.displayName || record.compiledProposition?.renderedText,
    ].map((v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim()).join('|');
    const list = byKey.get(key) ?? [];
    list.push(record);
    byKey.set(key, list);
  }

  const plans: Array<{ keepId: string; mergeIds: string[]; reason: string }> = [];
  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    const [keep, ...rest] = group;
    plans.push({
      keepId: keep.proposalId,
      mergeIds: rest.map((r) => r.proposalId),
      reason: 'semantic_duplicate_pending_proposals',
    });
  }
  return plans;
}
