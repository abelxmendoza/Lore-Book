import type { EntityRef } from './eventInferenceTypes';

const PLACE_AT_RE =
  /\b(?:at|in|inside|outside|near)\s+(?:the\s+)?((?:Bad\s+Dogg\s+Compound|Tio\s+Ralph'?s?\s+(?:house|home)|Denny'?s(?:\s+Hollywood)?|Whittier\s+Christian\s+Middle\s+School|Japan|Club\s+Metro|[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,4}))\b/gi;

export function extractPlaceAnchors(text: string): EntityRef[] {
  const out: EntityRef[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(PLACE_AT_RE.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ displayName: name });
  }
  return out;
}

export function pickPrimaryPlace(text: string): EntityRef | undefined {
  return extractPlaceAnchors(text)[0];
}
