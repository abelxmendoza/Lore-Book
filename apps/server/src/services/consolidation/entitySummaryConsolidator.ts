import { collectProvenance, mergeConfidence } from './consolidationProvenanceService';
import type {
  ConsolidatedSummary,
  ConsolidationEvidenceFragment,
} from './consolidationTypes';
import { normalizeClaimKey, subjectKeyFromFragment } from './consolidationTypes';

export function consolidateEntitySummaries(
  fragments: ConsolidationEvidenceFragment[],
  seenAt?: string,
): ConsolidatedSummary[] {
  const entityFrags = fragments.filter(
    (f) => f.kind === 'entity' || f.entityNames.length > 0,
  );
  const byEntity = new Map<string, ConsolidationEvidenceFragment[]>();

  for (const fragment of entityFrags) {
    const key = subjectKeyFromFragment(fragment);
    const list = byEntity.get(key) ?? [];
    list.push(fragment);
    byEntity.set(key, list);
  }

  const summaries: ConsolidatedSummary[] = [];
  for (const [key, frags] of byEntity) {
    const sorted = [...frags].sort((a, b) => (a.eventAt ?? '').localeCompare(b.eventAt ?? ''));
    const name = sorted[0]?.entityNames[0] ?? key;
    const relationships = [...new Set(sorted.flatMap((f) => f.relationshipLabels))];
    const events = sorted.map((f) => f.text).slice(0, 3);
    const eras = [...new Set(sorted.flatMap((f) => f.eraLabels))];
    const sensitive = sorted.some((f) => f.sensitiveCategories.length > 0);

    const summaryText = [
      `${name}: ${relationships.join(', ') || 'known entity'}.`,
      events.length ? `Notable: ${events.join('; ')}.` : '',
      eras.length ? `Timeline role: ${eras.join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const provenance = collectProvenance(sorted);
    summaries.push({
      id: crypto.randomUUID(),
      summaryText,
      kind: 'entity',
      subjectKey: normalizeClaimKey(key),
      confidence: mergeConfidence(sorted),
      mentionCount: sorted.length,
      ...provenance,
      reviewRequired: sensitive,
      contradicted: false,
      timelineOrdered: true,
      createdAt: seenAt ?? new Date().toISOString(),
    });
  }

  return summaries;
}
