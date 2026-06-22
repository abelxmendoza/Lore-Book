import type { ConceptCandidate } from './conceptInferenceTypes';
import { buildConceptContext } from './conceptProvenanceService';

const MENTAL_MODEL_RE =
  /\b(?:lexer|parser|planner|interpreter)\b[^.!?]*(?:detects?|understands?|proposes?|executes?)[^.!?]*/gi;

const PIPELINE_MODEL_RE =
  /\bLexer\s+detects,\s*parser\s+understands,\s*planner\s+proposes,\s*interpreter\s+executes\b/i;

export function inferMentalModels(text: string): ConceptCandidate[] {
  const out: ConceptCandidate[] = [];

  if (PIPELINE_MODEL_RE.test(text) || MENTAL_MODEL_RE.test(text)) {
    const displayName = 'Lexer-Parser-Planner-Interpreter Model';
    const evidence =
      text.match(PIPELINE_MODEL_RE)?.[0] ??
      text.match(MENTAL_MODEL_RE)?.[0] ??
      'mental model pipeline';

    out.push({
      displayName,
      conceptType: 'mental_model',
      context: buildConceptContext(text, displayName, {
        sourceDomain: 'architecture',
        projectContext: text.match(/\bLoreBook\b/i)?.[0],
        userStance: 'explores',
      }),
      evidencePhrases: [evidence],
      sourceMessageIds: [],
      confidence: 0.92,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'suggested_concept',
    });
  }

  return out;
}
