import type { PlaceMentionContext } from './placeTypes';

/**
 * Classify *how* a place is mentioned. Mentions of third-party education/work
 * must not become user visits.
 */
export function classifyPlaceMentionContext(
  placeName: string,
  evidenceText = '',
  aliases: string[] = [],
): PlaceMentionContext {
  const place = placeName.trim();
  const text = `${evidenceText}`.toLowerCase();
  const placeKeys = [place, ...aliases]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const mentionsPlace = placeKeys.some((key) => key.length >= 2 && text.includes(key));

  if (!text.trim()) return 'MENTIONED';

  if (/\b(?:wish|hope|want to|planning to|plan to|if i|maybe|someday)\b/.test(text)
    && placeKeys.some((placeKey) =>
      new RegExp(`\\b(?:visit|go to|travel to)\\b.*${escape(placeKey)}|${escape(placeKey)}.*\\b(?:visit|go)\\b`, 'i').test(text))) {
    return 'HYPOTHETICAL';
  }

  if (/\b(?:graduated from|alumni of|attended|goes to|went to school at|student at|studying at)\b/i.test(text)
    && (mentionsPlace || /\buniversity\b/i.test(place))) {
    // First-person school attendance can still be ATTENDED (education), not a nightlife "visit".
    return 'ATTENDED';
  }

  if (/\b(?:work(?:ed|ing)?\s+(?:at|in)|job at|employed at)\b/i.test(text) && mentionsPlace) {
    return 'WORKED_AT';
  }

  if (/\b(?:live[sd]?\s+(?:at|in)|living\s+(?:at|in)|grew up in|grew up at|my home|childhood home)\b/i.test(text)
    && mentionsPlace) {
    if (/\bgrew up\b/i.test(text)) return 'GREW_UP_IN';
    return 'LIVED_AT';
  }

  if (/\b(?:traveled to|flew to|trip to|vacation in|vacation to)\b/i.test(text) && mentionsPlace) {
    return 'TRAVELED_TO';
  }

  // First-person presence near the place → VISITED.
  const firstPersonVisit = placeKeys.some((placeKey) =>
    new RegExp(
      `\\b(?:i|we)\\b[^.!?]{0,40}\\b(?:went to|visited|drove to|was at|were at|headed to|arrived at)\\b[^.!?]{0,40}${escape(placeKey)}\\b`,
      'i',
    ).test(text)
    || new RegExp(
      `\\b(?:went to|visited|drove to|was at|were at)\\s+(?:the\\s+|my\\s+)?${escape(placeKey)}\\b`,
      'i',
    ).test(text));

  if (firstPersonVisit) return 'VISITED';

  // Third-party presence without user agency → REFERENCED.
  if (/\b(?:he|she|they|[A-Z][a-z]+)\b[^.!?]{0,40}\b(?:went to|visited|worked|graduated|attended)\b/i.test(text)) {
    return 'REFERENCED';
  }

  return 'MENTIONED';
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
