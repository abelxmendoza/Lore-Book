import type { ParsedClause } from './goalTypes';

export function segmentGoalClauses(text: string): ParsedClause[] {
  return text
    .split(/(?<=[.!?])\s+|\n+|;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index) => ({ text: part, index }));
}

export function selectGoalClause(sourceText: string, proposedTitle?: string): ParsedClause {
  const clauses = segmentGoalClauses(sourceText);
  if (!clauses.length) return { text: sourceText.trim(), index: 0 };
  if (!proposedTitle) return clauses[0];
  const words = proposedTitle.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  return [...clauses].sort((a, b) => {
    const score = (clause: ParsedClause) =>
      words.filter((word) => clause.text.toLowerCase().includes(word)).length;
    return score(b) - score(a);
  })[0];
}
