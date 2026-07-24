/**
 * Aggregate practice evidence for a skill candidate.
 */

export type PracticeEvent = {
  at?: string;
  sourceMessageId?: string;
  text?: string;
};

export type AggregatedSkillEvidence = {
  uniquePracticeCount: number;
  uniqueSourceCount: number;
  practiceEventAts: string[];
  sameSourceCollapsed: boolean;
  reasons: string[];
};

/**
 * Collapse same-source multi-extractor noise into one practice event.
 */
export function aggregateSkillEvidence(input: {
  evidenceText?: string;
  sourceMessageId?: string;
  practiceEventAts?: string[];
  practiceEvents?: PracticeEvent[];
}): AggregatedSkillEvidence {
  const reasons: string[] = [];
  const events = [...(input.practiceEvents ?? [])];

  if (input.practiceEventAts?.length) {
    for (const at of input.practiceEventAts) {
      events.push({ at, sourceMessageId: input.sourceMessageId, text: input.evidenceText });
    }
  }

  if (events.length === 0 && (input.evidenceText || input.sourceMessageId)) {
    events.push({
      at: undefined,
      sourceMessageId: input.sourceMessageId,
      text: input.evidenceText,
    });
  }

  // Collapse by sourceMessageId
  const bySource = new Map<string, PracticeEvent>();
  let sameSourceCollapsed = false;
  for (const ev of events) {
    const key = ev.sourceMessageId || `anon:${ev.at || ev.text || Math.random()}`;
    if (bySource.has(key) && ev.sourceMessageId) {
      sameSourceCollapsed = true;
      continue;
    }
    if (!bySource.has(key)) bySource.set(key, ev);
  }

  if (sameSourceCollapsed) reasons.push('same_source_deduped');

  const unique = Array.from(bySource.values());
  const ats = unique.map((e) => e.at).filter((x): x is string => Boolean(x));
  const uniqueSources = new Set(unique.map((e) => e.sourceMessageId).filter(Boolean));

  reasons.push(`practice_count:${unique.length}`);

  return {
    uniquePracticeCount: Math.max(1, unique.length),
    uniqueSourceCount: Math.max(1, uniqueSources.size || 1),
    practiceEventAts: ats,
    sameSourceCollapsed,
    reasons,
  };
}
