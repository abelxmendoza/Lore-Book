import type { SuggestionBookEntry, SuggestionMatchFields, SuggestionMatchStatus } from './suggestionMatchTypes';

function normalizeName(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function containmentIsPossessive(shorter: string, longer: string): boolean {
  const firstToken = shorter.split(' ')[0];
  if (!firstToken) return false;
  return new RegExp(`\\b${firstToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'?s\\b`).test(longer)
    && !longer.split(' ').includes(firstToken);
}

function namesOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

const DIMINUTIVE_SUFFIXES = ['ey', 'ie', 'ya', 'ee', 'y', 'i', 'a', 'o'] as const;

function firstNameToken(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean)[0] ?? '';
}

function collapseDuplicateLetters(value: string): string {
  return value.replace(/(.)\1+/g, '$1');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const cur = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = cur;
    }
  }
  return row[n];
}

function nicknameStem(token: string): string {
  const collapsed = collapseDuplicateLetters(token);
  for (const suffix of DIMINUTIVE_SUFFIXES) {
    if (collapsed.length - suffix.length >= 3 && collapsed.endsWith(suffix)) {
      return collapsed.slice(0, -suffix.length);
    }
  }
  return collapsed;
}

function sharedPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

/** Kiley ↔ Killa, Billy ↔ Billie — spoken nicknames that aren't substrings. */
export function areNicknameVariants(a: string, b: string): boolean {
  const left = firstNameToken(a);
  const right = firstNameToken(b);
  if (!left || !right) return false;
  if (left === right) return left.length >= 4;
  if (left.length < 4 || right.length < 4) return false;
  const stemA = nicknameStem(left);
  const stemB = nicknameStem(right);
  if (stemA.length < 3 || stemB.length < 3) return false;
  if (stemA === stemB) return true;
  if (Math.min(left.length, right.length) < 5) return false;
  return sharedPrefixLength(stemA, stemB) >= 3 && levenshtein(stemA, stemB) <= 1;
}

export function resolveSuggestionBookMatch(
  candidate: string,
  bookEntries: SuggestionBookEntry[]
): SuggestionMatchFields & { status: SuggestionMatchStatus } {
  const norm = normalizeName(candidate);
  if (!norm || norm.length < 2) return { status: 'existing', match_status: 'existing' };

  const flat: Array<{ norm: string; label: string; id?: string }> = [];
  for (const entry of bookEntries) {
    const names = [entry.name, ...(entry.aliases ?? [])];
    for (const raw of names) {
      const label = raw.trim();
      const n = normalizeName(label);
      if (!n) continue;
      flat.push({ norm: n, label, id: entry.id });
    }
  }

  for (const entry of flat) {
    if (entry.norm === norm) {
      return {
        status: 'existing',
        match_status: 'existing',
        matched_book_id: entry.id ?? null,
        matched_book_name: entry.label,
      };
    }
  }

  for (const entry of flat) {
    if (!namesOverlap(norm, entry.norm)) continue;
    const shorter = norm.length <= entry.norm.length ? norm : entry.norm;
    const longer = norm.length > entry.norm.length ? norm : entry.norm;
    if (containmentIsPossessive(shorter, longer)) continue;
    return {
      status: 'similar',
      match_status: 'similar',
      matched_book_id: entry.id ?? null,
      matched_book_name: entry.label,
    };
  }

  for (const entry of flat) {
    if (!areNicknameVariants(norm, entry.norm)) continue;
    return {
      status: 'similar',
      match_status: 'similar',
      matched_book_id: entry.id ?? null,
      matched_book_name: entry.label,
    };
  }

  return { status: 'new', match_status: 'new' };
}

/** @deprecated use resolveSuggestionBookMatch */
export function isNameAlreadyInBookList(candidate: string, bookNames: string[]): boolean {
  const entries = bookNames.map((name) => ({ name }));
  return resolveSuggestionBookMatch(candidate, entries).status !== 'new';
}

export function enrichSuggestionWithBookMatch<T extends Record<string, unknown>>(
  item: T,
  getName: (item: T) => string,
  bookEntries: SuggestionBookEntry[]
): T & SuggestionMatchFields {
  const clientMatch = resolveSuggestionBookMatch(getName(item), bookEntries);
  const serverStatus = item.match_status as SuggestionMatchStatus | undefined;
  const serverName = item.matched_book_name as string | null | undefined;
  const serverId = item.matched_book_id as string | null | undefined;

  if (serverStatus === 'existing' || clientMatch.status === 'existing') {
    return {
      ...item,
      match_status: 'existing',
      matched_book_id: serverId ?? clientMatch.matched_book_id ?? null,
      matched_book_name: serverName ?? clientMatch.matched_book_name ?? null,
    };
  }
  if (serverStatus === 'similar' || clientMatch.status === 'similar') {
    return {
      ...item,
      match_status: 'similar',
      matched_book_id: serverId ?? clientMatch.matched_book_id ?? null,
      matched_book_name: serverName ?? clientMatch.matched_book_name ?? null,
    };
  }
  return {
    ...item,
    match_status: serverStatus ?? 'new',
    matched_book_id: serverId ?? null,
    matched_book_name: serverName ?? null,
  };
}

export function filterVisibleSuggestions<T extends SuggestionMatchFields>(
  items: T[],
  getName: (item: T) => string,
  bookEntries: SuggestionBookEntry[]
): T[] {
  return collapseSuggestionsByBookMatch(
    items
      .map((item) => enrichSuggestionWithBookMatch(item, getName, bookEntries))
      .filter((item) => item.match_status !== 'existing'),
  );
}

/** Keep the strongest card when several suggestions point at the same book skill. */
export function collapseSuggestionsByBookMatch<T extends SuggestionMatchFields & { confidence?: number | null }>(
  items: T[],
): T[] {
  const byKey = new Map<string, T>();
  const unmatched: T[] = [];
  for (const item of items) {
    const key = item.matched_book_id || item.matched_book_name?.trim().toLowerCase() || '';
    if (!key) {
      unmatched.push(item);
      continue;
    }
    const prev = byKey.get(key);
    const prevScore = prev?.confidence ?? 0;
    const nextScore = item.confidence ?? 0;
    if (!prev || nextScore > prevScore) byKey.set(key, item);
  }
  return [...byKey.values(), ...unmatched];
}
