/** Time phrases attach to events — never become standalone event cards. */

export const TIME_ONLY_PHRASES = new Set([
  'yesterday',
  'last night',
  'today',
  'tonight',
  'last summer',
  'last week',
  'last year',
  'last month',
  'before covid',
  'around noon',
  'after school',
  'lunch break',
  'a few weeks ago',
  'a couple weeks ago',
]);

const TIME_PATTERN =
  /\b(?:yesterday|last\s+night|last\s+summer|last\s+week|last\s+year|last\s+month|before\s+covid|every\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|around\s+noon|after\s+school|lunch\s+break|a\s+(?:few|couple)\s+weeks?\s+ago)\b/gi;

const RECURRING_PATTERN =
  /\b(?:every\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|weekly|all\s+the\s+time|used\s+to)\b/i;

export function extractTimeAnchors(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(TIME_PATTERN.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    out.add(m[0].trim());
  }
  return [...out];
}

export function isTimeOnlySpan(span: string): boolean {
  const key = span.trim().toLowerCase().replace(/\s+/g, ' ');
  return TIME_ONLY_PHRASES.has(key);
}

export function isRecurringTimeCue(text: string): boolean {
  return RECURRING_PATTERN.test(text);
}

export function splitEventTimeTail(displayName: string): { eventName: string; timeHint?: string } {
  const timeTail = displayName.match(
    /^(.+?)\s+(last\s+night|yesterday|last\s+summer|a\s+(?:few|couple)\s+weeks?\s+ago)$/i,
  );
  if (timeTail) {
    return { eventName: timeTail[1].trim(), timeHint: timeTail[2].trim() };
  }
  return { eventName: displayName.trim() };
}
