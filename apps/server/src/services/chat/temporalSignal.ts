/**
 * Cheap, deterministic pre-gate for temporal extraction.
 *
 * extractDatesAndTimes() runs an LLM on every message to find dates/times, but
 * most messages have none. This decides — with a regex, no API call — whether a
 * message could plausibly contain a temporal reference. It is intentionally
 * permissive (false positives just run the LLM as before; the only thing it must
 * never do is miss a real date), so the win is skipping clearly non-temporal
 * messages ("thanks", "tell me about my friends").
 */

const TEMPORAL_RE = new RegExp(
  [
    '\\d', // any digit (years, times, "3 days")
    "\\b(yesterday|today|tonight|tomorrow|now|soon|later|recently|lately|ago|since|until|till|before|after|during|earlier|nowadays|someday)\\b",
    "\\b(last|next|this|past|coming|upcoming)\\s+\\w+", // "last week", "next month"
    '\\b(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years|decade|decades|morning|afternoon|evening|night|noon|midnight|weekend|century)\\b',
    '\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(?:uary|ruary|ch|il|e|y|ust|tember|ober|ember)?\\b',
    '\\b(mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?\\b',
    "\\b(o'?clock|am|pm|a\\.m\\.|p\\.m\\.)\\b",
    '\\b(birthday|anniversary|christmas|holiday|easter|thanksgiving|new\\s*year)\\b',
  ].join('|'),
  'i',
);

export function hasTemporalSignal(message: string): boolean {
  if (!message) return false;
  return TEMPORAL_RE.test(message);
}
