import { collectProvenance, mergeConfidence } from './consolidationProvenanceService';
import type {
  ConsolidatedSummary,
  ConsolidationEvidenceFragment,
} from './consolidationTypes';
import { normalizeClaimKey } from './consolidationTypes';

export function consolidateNarrativeAnchorSummaries(
  fragments: ConsolidationEvidenceFragment[],
  seenAt?: string,
): ConsolidatedSummary[] {
  const anchorFrags = fragments.filter(
    (f) => f.kind === 'anchor' || f.anchorTitles.length > 0,
  );
  const byAnchor = new Map<string, ConsolidationEvidenceFragment[]>();

  for (const fragment of anchorFrags) {
    const title = fragment.anchorTitles[0] ?? 'anchor';
    const key = normalizeClaimKey(title);
    const list = byAnchor.get(key) ?? [];
    list.push(fragment);
    byAnchor.set(key, list);
  }

  const summaries: ConsolidatedSummary[] = [];
  for (const [key, frags] of byAnchor) {
    const sorted = [...frags].sort((a, b) => (a.eventAt ?? '').localeCompare(b.eventAt ?? ''));
    const title = sorted[0]?.anchorTitles[0] ?? key;
    const entities = [...new Set(sorted.flatMap((f) => f.entityNames))];
    const snippets = sorted.map((f) => f.text).slice(0, 4);
    const sensitive = sorted.some((f) => f.sensitiveCategories.length > 0);

    const summaryText = `${title} — ${entities.join(', ') || 'clustered evidence'}: ${snippets.join('; ')}`;

    summaries.push({
      id: crypto.randomUUID(),
      summaryText,
      kind: 'anchor',
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
