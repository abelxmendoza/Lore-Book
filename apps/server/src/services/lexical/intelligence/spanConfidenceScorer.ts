import type { RawSpanCandidate, SpanAlternative } from './lexicalIntelligenceTypes';
import type { ContextRuleResult } from './contextWindowScorer';
import { defaultAlternatives } from './lexicalEntityTaxonomy';
import { fuseLogOddsConfidence } from './logOddsConfidence';

export type ScoredSpanInput = RawSpanCandidate & {
  context: ContextRuleResult;
};

export function scoreSpanConfidence(input: ScoredSpanInput): {
  confidence: number;
  alternatives: SpanAlternative[];
  classificationEntropy?: number;
} {
  const taxonomyAlts = defaultAlternatives(
    input.context.type,
    input.context.subtype,
    input.context.evidencePhrases
  );

  const merged = mergeAlternatives(input.context.alternatives, taxonomyAlts);
  merged.sort((a, b) => b.confidence - a.confidence);
  const alternatives = merged.slice(0, 4);

  const fused = fuseLogOddsConfidence({
    baseConfidence: input.baseConfidence + input.context.confidenceDelta * 0.5,
    rulesFired: input.context.rulesFired,
    detectionSource: input.detectionSource,
    needsReview: input.context.needsReview ?? input.needsReview,
    alternatives,
  });

  return {
    confidence: fused.confidence,
    alternatives,
    classificationEntropy: fused.entropy,
  };
}

function mergeAlternatives(a: SpanAlternative[], b: SpanAlternative[]): SpanAlternative[] {
  const map = new Map<string, SpanAlternative>();
  for (const alt of [...a, ...b]) {
    const key = `${alt.type}:${alt.subtype ?? ''}`;
    const existing = map.get(key);
    if (!existing || alt.confidence > existing.confidence) {
      map.set(key, alt);
    }
  }
  return [...map.values()];
}

export function confidenceMeetsThreshold(confidence: number, min = 0.7): boolean {
  return confidence >= min;
}
