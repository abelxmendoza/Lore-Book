import type { RetrievalMemoryRecord, RetrievalProvenance, RetrievedMemory } from './retrievalTypes';

export function bindProvenance(record: RetrievalMemoryRecord): RetrievalProvenance {
  if (!record.provenance.sourceQuote?.trim()) {
    throw new Error('Provenance required for recall: missing source quote');
  }
  return {
    sourceMessageId: record.provenance.sourceMessageId,
    sourceQuote: record.provenance.sourceQuote,
    truthState: record.provenance.truthState,
    confidence: record.provenance.confidence,
    evidenceBundleId: record.provenance.evidenceBundleId,
  };
}

export function bindProvenanceToResults(results: RetrievedMemory[]): RetrievedMemory[] {
  return results.map((r) => ({
    ...r,
    provenance: bindProvenance(r.record),
  }));
}

export function allResultsHaveProvenance(results: RetrievedMemory[]): boolean {
  return results.every(
    (r) =>
      Boolean(r.provenance.sourceQuote?.trim()) &&
      Boolean(r.provenance.truthState) &&
      typeof r.provenance.confidence === 'number',
  );
}

export function formatProvenanceCitation(provenance: RetrievalProvenance): string {
  const msg = provenance.sourceMessageId ? `[${provenance.sourceMessageId}]` : '';
  return `${msg} "${provenance.sourceQuote}" (${provenance.truthState}, ${provenance.confidence.toFixed(2)})`;
}
