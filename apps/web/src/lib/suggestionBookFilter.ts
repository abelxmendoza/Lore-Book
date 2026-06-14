/** Client-side guard: hide suggestions that already match book entries. */

function normalizeName(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isNameAlreadyInBookList(candidate: string, bookNames: string[]): boolean {
  const norm = normalizeName(candidate);
  if (!norm) return true;

  for (const raw of bookNames) {
    const existing = normalizeName(raw);
    if (!existing) continue;
    if (existing === norm) return true;
    if (existing.includes(norm) || norm.includes(existing)) {
      const shorter = norm.length <= existing.length ? norm : existing;
      const longer = norm.length > existing.length ? norm : existing;
      const firstToken = shorter.split(' ')[0];
      if (firstToken && new RegExp(`\\b${firstToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'?s\\b`).test(longer) && !longer.split(' ').includes(firstToken)) {
        continue;
      }
      return true;
    }
  }

  return false;
}
