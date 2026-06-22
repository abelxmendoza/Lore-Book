import { collectProvenance, mergeConfidence } from './consolidationProvenanceService';
import type {
  ConsolidatedSummary,
  ConsolidationEvidenceFragment,
} from './consolidationTypes';
import { normalizeClaimKey } from './consolidationTypes';

export function consolidateRelationshipSummaries(
  fragments: ConsolidationEvidenceFragment[],
  seenAt?: string,
): ConsolidatedSummary[] {
  const relFrags = fragments.filter(
    (f) => f.kind === 'relationship' || f.relationshipLabels.length > 0,
  );
  const byRel = new Map<string, ConsolidationEvidenceFragment[]>();

  for (const fragment of relFrags) {
    const label = fragment.relationshipLabels[0] ?? 'relationship';
    const entity = fragment.entityNames[0] ?? 'unknown';
    const key = normalizeClaimKey(`${entity}:${label}`);
    const list = byRel.get(key) ?? [];
    list.push(fragment);
    byRel.set(key, list);
  }

  const summaries: ConsolidatedSummary[] = [];
  for (const [key, frags] of byRel) {
    const sorted = [...frags].sort((a, b) => (a.eventAt ?? '').localeCompare(b.eventAt ?? ''));
    const entity = sorted[0]?.entityNames[0] ?? 'Someone';
    const labels = [...new Set(sorted.flatMap((f) => f.relationshipLabels))];
    const sensitive = sorted.some((f) => f.sensitiveCategories.length > 0);

    const summaryText = `${entity} — ${labels.join(', ')} (${sorted.length} evidence fragments).`;

    summaries.push({
      id: crypto.randomUUID(),
      summaryText,
      kind: 'relationship',
      subjectKey: key,
      confidence: mergeConfidence(sorted),
      mentionCount: sorted.length,
      ...collectProvenance(sorted),
      reviewRequired: sensitive,
      contradicted: false,
      timelineOrdered: true,
      createdAt: seenAt ?? new Date().toISOString(),
    });
  }

  return summaries;
}
