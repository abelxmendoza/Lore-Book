/**
 * Client-side mirror of server lexical noise rejection.
 * Keep in sync with apps/server/.../lexicalPreviewService.isLexicalNoiseToken.
 */
export function isLexicalNoiseToken(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/\.\.\.|…/.test(t)) return true;
  if (/^(?:I|we|you|he|she|they|it|me|him|her|us|them|my|our|your|mine|yours|myself|yourself)$/i.test(t)) {
    return true;
  }
  if (/^(?:who|what|when|where|why|how|which|whose|whom)$/i.test(t)) return true;
  if (
    /^(?:tell|show|explain|give|list|remember|describe|summarize|recall|say|ask|find|get|make|let|please|help)$/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/^(?:a|an|the|this|that|these|those|and|or|but|so|if|to|of|in|on|at|for|with|from|about)$/i.test(t)) {
    return true;
  }
  // Bare temporal adverbs — planner signals, not entity chips.
  if (/^(?:today|tonight|tomorrow|yesterday|now|later|soon|recently)$/i.test(t)) {
    return true;
  }
  // Truncated mid-phrase fragments ("Up My Degr...")
  if (/^[A-Z][\w']*\s+(?:My|Our|Your|The|A|An)\s+[A-Z][\w']{0,4}$/.test(t)) return true;
  return false;
}
