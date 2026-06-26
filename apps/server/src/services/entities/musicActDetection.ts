/**
 * Deterministic music-act / band detection from conversation context.
 *
 * Reverse-engineered from real mis-classifications: "Ex Lover" (a band) and
 * "Prayers" / "Cholo Goth" (a musical act) were stored as PEOPLE — and even as
 * romantic partners — because a bare proper noun defaults to "person". The
 * origin conversation actually says it plainly:
 *   "Ex Lover the band sounded so good"
 *   "the Ex Lover and Vilevo band shows"
 *   "Mr. Chino is a DJ for Prayers aka Cholo Goth"
 *
 * Rather than hardcoding each band name, this reads those phrasings so ANY act
 * (Vilevo, Foos Gone Wild, the next one) is caught. No LLM — pure regex.
 *
 * Note: "DJ <Name>" is intentionally NOT a signal — a DJ is usually a person.
 * Only "DJ FOR <Name>" implies <Name> is the act being played.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type MusicActSignal =
  | 'the_band'
  | 'band_named'
  | 'band_called'
  | 'name_band'
  | 'band_shows'
  | 'dj_for'
  | 'opening_for'
  | 'set_by'
  | 'performed';

export type MusicActResult = { isMusicAct: boolean; signal?: MusicActSignal };

/**
 * True when the surrounding context presents `name` as a band / musical act.
 * High-precision: every pattern anchors on the name plus an explicit music cue.
 */
export function looksLikeMusicAct(name: string | null | undefined, context?: string | null): MusicActResult {
  if (!name || !name.trim() || !context || !context.trim()) return { isMusicAct: false };
  const n = escapeRegExp(name.trim());

  const patterns: Array<[RegExp, MusicActSignal]> = [
    [new RegExp(`\\b${n}\\s+the\\s+band\\b`, 'i'), 'the_band'],
    [new RegExp(`\\bthe\\s+band\\s+${n}\\b`, 'i'), 'band_named'],
    [new RegExp(`\\bband\\s+(?:called|named)\\s+${n}\\b`, 'i'), 'band_called'],
    // "Ex Lover and Vilevo band shows" — name, optional "and <other>", then band show(s)
    [new RegExp(`\\b${n}\\s+(?:and\\s+[\\w'’]+\\s+)?band\\s+shows?\\b`, 'i'), 'band_shows'],
    [new RegExp(`\\b${n}\\s+band\\b`, 'i'), 'name_band'],
    [new RegExp(`\\bdj(?:'?d|ed|ing)?\\s+for\\s+${n}\\b`, 'i'), 'dj_for'],
    [new RegExp(`\\bopening\\s+for\\s+${n}\\b`, 'i'), 'opening_for'],
    [new RegExp(`\\bset\\s+by\\s+${n}\\b`, 'i'), 'set_by'],
    [new RegExp(`\\b${n}\\s+(?:played|performed|headlined)\\b`, 'i'), 'performed'],
  ];

  for (const [re, signal] of patterns) {
    if (re.test(context)) return { isMusicAct: true, signal };
  }
  return { isMusicAct: false };
}
