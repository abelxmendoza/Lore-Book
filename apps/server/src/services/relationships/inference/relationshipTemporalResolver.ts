import type { TemporalStatus } from './relationshipInferenceTypes';

const TEMPORAL_PATTERNS: Array<{ pattern: RegExp; status: TemporalStatus }> = [
  { pattern: /\bused\s+to\b/i, status: 'past' },
  { pattern: /\bformer\b/i, status: 'former' },
  { pattern: /\bex\b/i, status: 'former' },
  { pattern: /\bold\s+(?:friend|roommate|coworker)\b/i, status: 'past' },
  { pattern: /\bhaven'?t\s+seen\s+(?:since|in)\b/i, status: 'dormant' },
  { pattern: /\bfrom\s+middle\s+school\b/i, status: 'past' },
  { pattern: /\bcurrent(?:ly)?\b/i, status: 'current' },
  { pattern: /\bnow\b/i, status: 'current' },
  { pattern: /\bcrush\b/i, status: 'desired' },
  { pattern: /\btalking\s+stage\b/i, status: 'uncertain' },
];

export function resolveTemporalStatus(text: string, predicate: string): TemporalStatus {
  for (const { pattern, status } of TEMPORAL_PATTERNS) {
    if (pattern.test(text)) return status;
  }
  if (/dormant|used\s+to\s+be\s+my\s+best\s+friend/i.test(text)) return 'dormant';
  if (predicate.includes('ex_') || predicate.startsWith('ex_')) return 'former';
  return 'current';
}

export function applyTemporalToPredicate(predicate: string, status: TemporalStatus): string {
  if (status === 'dormant' && predicate === 'best_friend_of') return 'dormant_best_friend_of';
  if (status === 'former' && predicate === 'best_friend_of') return 'former_best_friend_of';
  if (status === 'past' && predicate === 'best_friend_of') return 'former_best_friend_of';
  return predicate;
}
