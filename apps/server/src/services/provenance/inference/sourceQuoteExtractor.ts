/**
 * Extract exact supporting phrases from message text for evidence bundles.
 */

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function findSentenceContaining(text: string, needle: string): string | undefined {
  if (!needle.trim()) return undefined;
  const lower = needle.toLowerCase();
  return splitSentences(text).find((s) => s.toLowerCase().includes(lower));
}

export function extractSourceQuote(text: string, span?: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  if (span?.trim()) {
    const match = findSentenceContaining(trimmed, span);
    if (match) return match;
  }

  const sentences = splitSentences(trimmed);
  if (sentences.length === 1) return sentences[0];
  return sentences[0] ?? trimmed.slice(0, 280);
}

export function extractBestQuoteForClaim(text: string, claimText: string): string {
  const byClaim = findSentenceContaining(text, claimText);
  if (byClaim) return byClaim;

  const words = claimText.split(/\s+/).filter((w) => w.length > 3);
  for (const word of words) {
    const hit = findSentenceContaining(text, word);
    if (hit) return hit;
  }

  return extractSourceQuote(text);
}
