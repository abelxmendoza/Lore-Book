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
  return items
    .map((item) => enrichSuggestionWithBookMatch(item, getName, bookEntries))
    .filter((item) => item.match_status !== 'existing');
}
