import { isStandaloneTimePhrase } from './temporalExpressionExtractor';
import { shouldCreateTimeBookCard } from './timelineStitchingService';
import type { EntityQualityCandidate, EntityQualityVerdict } from '../lorebook/quality/entityQualityGuardTypes';

/** Reject LoreBook card candidates that are standalone time phrases. */
export function guardStandaloneTimePhrase(candidate: EntityQualityCandidate): EntityQualityVerdict | null {
  const name = candidate.name.trim();
  if (!name) return null;

  if (isStandaloneTimePhrase(name) || !shouldCreateTimeBookCard(name)) {
    return {
      gate: 'reject',
      name,
      domain: candidate.domain,
      confidence: 0,
      provenance: [{ guard: 'standaloneTimeGuard', rule: 'time_is_metadata_not_book_card' }],
      requiresReview: false,
      reason: 'Time expressions attach to events and entities — they are not standalone book cards',
    };
  }

  return null;
}

/** True when a suggestion name should be blocked from any LoreBook upsert path. */
export function isBlockedTimeSuggestion(name: string): boolean {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return isStandaloneTimePhrase(key) || !shouldCreateTimeBookCard(key);
}
