/**
 * Timing / setting mentions are not Actors in the focal episode.
 * "after the Bill Skasby set" names a performer as calendar context,
 * not a participant in the relationship conflict.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TIMING_ROLE =
  '(?:set|show|setlist|performance|gig|opening|act)';

/**
 * True when every occurrence of `name` in `texts` is inside a timing phrase
 * such as "after the {Name} set". Names that never appear in the texts are
 * left alone (metadata-only mentions).
 */
export function isContextualTimingOnlyMention(name: string, texts: string[]): boolean {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.split(/\s+/).length > 6) return false;
  const escaped = escapeRegExp(trimmed);
  const mentionRe = new RegExp(`\\b${escaped}\\b`, 'gi');
  const timingRe = new RegExp(
    `(?:after|before|during|following)\\s+(?:the\\s+)?${escaped}(?:['’]s)?\\s+${TIMING_ROLE}\\b`,
    'gi',
  );

  let mentionCount = 0;
  let timingCount = 0;
  for (const text of texts) {
    if (!text) continue;
    mentionCount += text.match(mentionRe)?.length ?? 0;
    timingCount += text.match(timingRe)?.length ?? 0;
  }
  return mentionCount > 0 && timingCount >= mentionCount;
}
