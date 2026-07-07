/**
 * Event attendance inference — an event existing in the user's world does not
 * mean they were there. "Self Made was happening but the scene still needed
 * more space from me" is awareness, not attendance, and the books must keep
 * that distinction.
 */

export type EventAttendance = 'attended' | 'not_attended' | 'unknown';

const NOT_ATTENDED_PATTERNS: RegExp[] = [
  /\b(didn'?t|did not|couldn'?t|could not|won'?t|will not)\s+(go|make it|attend|end up going|be there)\b/i,
  /\b(skipp?ed|missed)\s+(it|that|the\s+\w+|out)\b/i,
  /\bwasn'?t\s+(there|able to (go|make it))\b/i,
  /\b(decided|chose)\s+not\s+to\s+go\b/i,
  /\bstayed\s+(home|in)\b/i,
  /\bnot\s+going\s+to\s+(that|the)\b/i,
  /\bneeded\s+more\s+space\s+from\s+me\b/i,
  /\bsat\s+(this|that)\s+one\s+out\b/i,
  /\bwish\s+i\s+(went|could\s+have\s+gone|was\s+there)\b/i,
];

const ATTENDED_PATTERNS: RegExp[] = [
  /\bi\s+(went|got)\s+to\b/i,
  /\bi'?m\s+(going to this|at|here at)\b/i,
  /\bi\s+(was|am)\s+(at|there)\b/i,
  /\b(we|i)\s+(attended|showed up|pulled up|checked out)\b/i,
  /\bi\s+saw\s+(them|him|her|it)\s+(live|play|perform)\b/i,
  /\b(performed|played)\s+at\b.*\bi\b/i,
];

/**
 * Infer whether the user attended an event from the evidence text that named
 * it. Not-attended cues win over attended cues (people describe events they
 * skipped using attendance words: "everyone went, I didn't").
 */
export function inferEventAttendance(text: string | null | undefined): {
  attendance: EventAttendance;
  cue?: string;
} {
  const t = (text ?? '').trim();
  if (!t) return { attendance: 'unknown' };

  for (const re of NOT_ATTENDED_PATTERNS) {
    const m = re.exec(t);
    if (m) return { attendance: 'not_attended', cue: m[0] };
  }
  for (const re of ATTENDED_PATTERNS) {
    const m = re.exec(t);
    if (m) return { attendance: 'attended', cue: m[0] };
  }
  return { attendance: 'unknown' };
}
