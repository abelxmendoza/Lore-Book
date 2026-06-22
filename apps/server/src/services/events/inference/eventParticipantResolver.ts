import type { EntityRef } from './eventInferenceTypes';

const EXPLICIT_NAME_RE =
  /\b([A-ZÀ-Ý][a-zà-ÿ'’.-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’.-]+)?)\b/g;

const PLURAL_GROUP_ONLY = new Set([
  'friends',
  'my friends',
  'we',
  'us',
  'people',
  'everyone',
  'some guys',
  'some girls',
]);

/** Resolve explicit participants — never invent unnamed individuals from plural groups. */
export function resolveParticipants(text: string): EntityRef[] {
  const out: EntityRef[] = [];
  const seen = new Set<string>();

  if (PLURAL_GROUP_ONLY.has(text.trim().toLowerCase())) return [];

  let m: RegExpExecArray | null;
  const re = new RegExp(EXPLICIT_NAME_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    if (isGenericGroupLabel(name)) continue;
    if (isLikelyPlaceOrEventToken(name)) continue;
    seen.add(key);
    out.push({ displayName: name });
  }

  return out;
}

function isGenericGroupLabel(name: string): boolean {
  const key = name.toLowerCase();
  return (
    PLURAL_GROUP_ONLY.has(key) ||
    /\b(friends|people|everyone|guys|girls)\b/i.test(name)
  );
}

function isLikelyPlaceOrEventToken(name: string): boolean {
  return (
    /^(?:Ska Prom|Gothicumbia|Code Red|Amazon|Japan|Wednesday|LA)$/i.test(name) ||
    /\b(school|compound|walmart|denny)\b/i.test(name)
  );
}

export function hasPluralGroupOnly(text: string): boolean {
  return /\b(?:my\s+)?friends\b/i.test(text) && !/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(text);
}
