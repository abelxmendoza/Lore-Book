import type { ConceptInferenceContext } from './conceptInferenceTypes';

export function extractEvidencePhrases(text: string, span: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const needle = span.toLowerCase();
  return sentences
    .filter((s) => s.toLowerCase().includes(needle))
    .map((s) => s.trim())
    .slice(0, 4);
}

export function buildConceptContext(
  text: string,
  span: string,
  partial: ConceptInferenceContext = {},
): ConceptInferenceContext {
  return {
    ...partial,
    projectContext: partial.projectContext ?? extractProjectContext(text),
    emotionalContext: partial.emotionalContext ?? extractEmotionalContext(text),
    sourceDomain: partial.sourceDomain ?? extractSourceDomain(text),
    userStance: partial.userStance ?? extractUserStance(text),
  };
}

function extractProjectContext(text: string): string | undefined {
  const m = text.match(/\b(?:LoreBook|lorebook|Omega-1|Omega)\b/i);
  return m?.[0];
}

function extractEmotionalContext(text: string): string | undefined {
  const m = text.match(
    /\b(?:anxiety|rejected|reputation|belonging|confusion|embarrassed|scared|proud|ashamed)\b/i,
  );
  return m?.[0]?.trim();
}

function extractSourceDomain(text: string): string | undefined {
  if (/\b(?:parser|compiler|lexer|architecture|semantic)\b/i.test(text)) return 'architecture';
  if (/\b(?:life|memory|identity|narrative)\b/i.test(text)) return 'narrative';
  if (/\b(?:social|reputation|status)\b/i.test(text)) return 'social';
  if (/\b(?:ontology|provenance|truth-?state)\b/i.test(text) && /\b(?:architecture|layer|LoreBook)\b/i.test(text)) {
    return 'architecture';
  }
  return undefined;
}

function extractUserStance(text: string): ConceptInferenceContext['userStance'] {
  if (/\bI\s+(?:believe|think|realized|feel like|care about)\b/i.test(text)) return 'believes';
  if (/\bI\s+(?:don't want|fear|worry)\b/i.test(text)) return 'fears';
  if (/\bI\s+want\s+LoreBook\b/i.test(text)) return 'wants';
  if (/\b(?:question|unsure|wondering)\b/i.test(text)) return 'questions';
  if (/\b(?:exploring|experimenting with)\b/i.test(text)) return 'explores';
  return undefined;
}

export function hasProvenance(candidate: {
  sourceMessageIds: string[];
  evidencePhrases: string[];
  context: ConceptInferenceContext;
}): boolean {
  return (
    candidate.sourceMessageIds.length > 0 &&
    candidate.evidencePhrases.length > 0 &&
    Boolean(
      candidate.context.userStance ||
        candidate.context.projectContext ||
        candidate.context.emotionalContext ||
        candidate.context.repeatedTheme ||
        candidate.context.sourceDomain,
    )
  );
}
