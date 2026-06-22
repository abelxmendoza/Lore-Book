import type {
  ConsolidatedSummary,
  ConsolidationEvidenceFragment,
} from './consolidationTypes';

export function hasProvenance(fragment: ConsolidationEvidenceFragment): boolean {
  return Boolean(fragment.sourceQuote?.trim()) && Boolean(fragment.text?.trim());
}

export function summaryHasProvenance(summary: ConsolidatedSummary): boolean {
  return (
    summary.sourceQuotes.length > 0 &&
    summary.sourceFragmentIds.length > 0 &&
    summary.sourceQuotes.every((q) => q.trim().length > 0)
  );
}

export function collectProvenance(fragments: ConsolidationEvidenceFragment[]): {
  sourceMessageIds: string[];
  sourceQuotes: string[];
  sourceFragmentIds: string[];
} {
  const sourceMessageIds = [
    ...new Set(fragments.map((f) => f.sourceMessageId).filter(Boolean) as string[]),
  ];
  const sourceQuotes = [...new Set(fragments.map((f) => f.sourceQuote.trim()).filter(Boolean))];
  const sourceFragmentIds = fragments.map((f) => f.id);
  return { sourceMessageIds, sourceQuotes, sourceFragmentIds };
}

export function mergeConfidence(fragments: ConsolidationEvidenceFragment[]): number {
  if (fragments.length === 0) return 0;
  const max = Math.max(...fragments.map((f) => f.confidence));
  const boost = Math.min(0.08, (fragments.length - 1) * 0.02);
  return Math.min(0.99, max + boost);
}

export function rejectSummaryWithoutProvenance(summary: ConsolidatedSummary): boolean {
  return !summaryHasProvenance(summary);
}

export function fragmentsWithProvenance(
  fragments: ConsolidationEvidenceFragment[],
): ConsolidationEvidenceFragment[] {
  return fragments.filter(hasProvenance);
}
