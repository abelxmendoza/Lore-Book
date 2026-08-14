export type StoredRelationProvenance = {
  source_message_id?: unknown;
  source_message_ids?: unknown;
  source_thread_ids?: unknown;
  source_assertion_ids?: unknown;
  evidence_phrase?: unknown;
};

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item)) : [];
}

export function mergeRelationProvenance(
  prior: StoredRelationProvenance | undefined,
  incoming: {
    sourceMessageIds: string[];
    sourceThreadIds: string[];
    sourceAssertionIds: string[];
    evidencePhrase: string;
  },
): {
  sourceMessageIds: string[];
  sourceThreadIds: string[];
  sourceAssertionIds: string[];
  evidencePhrase: string;
} {
  const legacyMessage = typeof prior?.source_message_id === 'string' ? [prior.source_message_id] : [];
  const priorEvidence = typeof prior?.evidence_phrase === 'string' ? prior.evidence_phrase : '';
  return {
    sourceMessageIds: [...new Set([...strings(prior?.source_message_ids), ...legacyMessage, ...incoming.sourceMessageIds])],
    sourceThreadIds: [...new Set([...strings(prior?.source_thread_ids), ...incoming.sourceThreadIds])],
    sourceAssertionIds: [...new Set([...strings(prior?.source_assertion_ids), ...incoming.sourceAssertionIds])],
    evidencePhrase: priorEvidence && priorEvidence !== incoming.evidencePhrase
      ? `${priorEvidence} | ${incoming.evidencePhrase}`.slice(0, 2000)
      : incoming.evidencePhrase,
  };
}
