/** Lightweight tokenization / entity helpers — no embeddings, no OpenAI. */

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'for', 'with',
  'is', 'was', 'are', 'were', 'be', 'been', 'i', 'me', 'my', 'we', 'you', 'your',
  'it', 'that', 'this', 'at', 'as', 'so', 'if', 'not', 'do', 'did', 'have',
  'has', 'had', 'from', 'about', 'into', 'than', 'then', 'when', 'while',
  'who', 'what', 'where', 'why', 'how', 'just', 'very', 'really', 'also',
]);

function stem(t: string): string {
  if (t.length <= 4) return t;
  if (t.endsWith('ing') && t.length > 5) return t.slice(0, -3);
  if (t.endsWith('ed') && t.length > 4) return t.slice(0, -2);
  if (t.endsWith('es') && t.length > 4) return t.slice(0, -2);
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) return t.slice(0, -1);
  return t;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => {
      if (!t || STOP.has(t)) return false;
      // Keep short tech tokens (ai, sql, pr, bjj as whole words of len>=2)
      if (t.length >= 3) return true;
      return t.length === 2 && /[a-z]{2}/.test(t);
    })
    .map(stem);
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function entityOverlap(
  messageEntities: string[],
  memoryEntities: string[],
  messageText: string,
): number {
  if (memoryEntities.length === 0) {
    // soft: does message mention any memory entity substring?
    return 0;
  }
  const msgLower = messageText.toLowerCase();
  const resolved = new Set(messageEntities.map((e) => e.toLowerCase()));
  let hits = 0;
  for (const e of memoryEntities) {
    const el = e.toLowerCase();
    if (resolved.has(el) || msgLower.includes(el)) hits += 1;
  }
  return Math.min(1, hits / Math.max(1, memoryEntities.length));
}

export function daysBetween(isoA: string | null | undefined, isoB: string): number | null {
  if (!isoA) return null;
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.abs(b - a) / 86400000;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Extract likely proper-name tokens (capitalized words) from free text. */
export function extractNameHints(text: string): string[] {
  const names: string[] = [];
  const re = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = m[1];
    if (!['Today', 'Someone', 'When', 'Later', 'Earlier', 'Rocket', 'Lab'].includes(n.split(' ')[0]!)) {
      names.push(n);
    }
  }
  return [...new Set(names)];
}
