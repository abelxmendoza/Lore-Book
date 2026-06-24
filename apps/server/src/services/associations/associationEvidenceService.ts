/**
 * Association Evidence Service — builds provenance records for associations
 * (Rule 14). Every association observation must store: the source message, a
 * verbatim quote, a timestamp, the rules that fired, and a per-observation
 * confidence. This service is the single place that constructs those records
 * so the shape stays consistent across every inference rule.
 */
import type { AssociationEvidence } from './associationTypes';

export interface BuildEvidenceInput {
  /** Full source text (used to extract a quote when an explicit one is absent). */
  text: string;
  /** A verbatim span to store as the quote; falls back to trimmed `text`. */
  quote?: string;
  sourceMessageId?: string;
  /** ISO timestamp; defaults to now. */
  timestamp?: string;
  rulesFired: string[];
  confidence: number;
}

const MAX_QUOTE_LEN = 280;

function clampQuote(quote: string): string {
  const q = quote.trim().replace(/\s+/g, ' ');
  return q.length > MAX_QUOTE_LEN ? `${q.slice(0, MAX_QUOTE_LEN - 1)}…` : q;
}

export const associationEvidenceService = {
  build(input: BuildEvidenceInput): AssociationEvidence {
    const quote = clampQuote(input.quote && input.quote.trim() ? input.quote : input.text);
    return {
      sourceMessageId: input.sourceMessageId,
      quote,
      timestamp: input.timestamp ?? new Date().toISOString(),
      rulesFired: Array.from(new Set(input.rulesFired)),
      confidence: input.confidence,
    };
  },

  /**
   * Merge two evidence arrays, de-duplicating by (sourceMessageId, quote) so the
   * same source message is never double-counted toward strength.
   */
  merge(
    existing: AssociationEvidence[],
    incoming: AssociationEvidence[],
  ): AssociationEvidence[] {
    const seen = new Set(existing.map((e) => `${e.sourceMessageId ?? ''}::${e.quote}`));
    const merged = [...existing];
    for (const e of incoming) {
      const key = `${e.sourceMessageId ?? ''}::${e.quote}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(e);
      }
    }
    return merged;
  },

  /** Count of distinct source messages backing an edge. */
  distinctSources(evidence: AssociationEvidence[]): number {
    const ids = new Set<string>();
    let anonymous = 0;
    for (const e of evidence) {
      if (e.sourceMessageId) ids.add(e.sourceMessageId);
      else anonymous += 1;
    }
    return ids.size + anonymous;
  },
};
