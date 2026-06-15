/**
 * Sprint AI — Significance layer (Phase AI-7)
 *
 * Surfaces meaning alongside facts from thread text + stored facts.
 * No new storage — derives from existing conversation and entity_facts.
 */

const MEANING_PATTERNS: RegExp[] = [
  /\b(the highlight was|what mattered|what meant|meant a lot|meant so much|appreciated|grateful|thankful for|special because|important because|still alive|while (she|he|they) (is|are) still|don't take for granted|cherish|treasured|will remember|never forget)\b[^.!?]{0,120}/gi,
  /\b(i (?:realized|realised|learned|felt)|it (?:felt|was) (?:important|special|meaningful))[^.!?]{0,100}/gi,
];

export function extractSignificanceFromText(text: string): string[] {
  const meanings: string[] = [];
  for (const pat of MEANING_PATTERNS) {
    for (const m of text.matchAll(pat)) {
      const phrase = m[0].replace(/\s+/g, ' ').trim();
      if (phrase.length > 15) meanings.push(phrase);
    }
  }
  return [...new Set(meanings)].slice(0, 4);
}

export function formatFactsAndMeaning(
  facts: string[],
  threadText?: string
): { factsBlock: string; meaningBlock: string | null } {
  const factsBlock =
    facts.length > 0
      ? facts.slice(0, 8).map((f) => `• ${f}`).join('\n')
      : '• No verified facts on record yet.';

  const meaning =
    threadText && threadText.trim().length > 0
      ? extractSignificanceFromText(threadText)
      : [];

  const meaningBlock =
    meaning.length > 0
      ? meaning.map((m) => `• ${m.charAt(0).toUpperCase()}${m.slice(1)}`).join('\n')
      : null;

  return { factsBlock, meaningBlock };
}
