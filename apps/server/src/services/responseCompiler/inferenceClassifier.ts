import type { StatementKind } from './responseCompilerTypes';
import { hasUncertaintyMarkers } from './uncertaintyDetector';

const QUESTION_RE = /\?\s*$/;
const SUGGESTION_RE =
  /\b(would you like|should I|shall I|do you want me to|want me to|can I add|could I create|let me know if you'd like)\b/i;
const SPECULATION_RE = /\b(may have|might have|could have|possibly|perhaps|maybe)\b/i;

export function classifyStatementKind(
  sentence: string,
  opts: { grounded?: boolean } = {},
): StatementKind {
  const s = sentence.trim();
  if (!s) return 'INFERENCE';

  if (SUGGESTION_RE.test(s)) return 'SUGGESTION';

  if (QUESTION_RE.test(s)) return 'QUESTION';

  if (SPECULATION_RE.test(s) || hasUncertaintyMarkers(s)) {
    if (SPECULATION_RE.test(s)) return 'SPECULATION';
    return 'INFERENCE';
  }

  if (opts.grounded) return 'FACT';
  return 'INFERENCE';
}

/** Never treat inference markers as hard facts. */
export function statementKindBlocksCanon(kind: StatementKind): boolean {
  return kind !== 'FACT';
}
