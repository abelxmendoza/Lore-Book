import type { LexicalDebugReport, LexicalIntelligenceResult } from './lexicalIntelligenceTypes';

export function buildLexicalDebugReport(
  text: string,
  result: LexicalIntelligenceResult
): LexicalDebugReport {
  const spanCount = result.spans.length;
  const averageConfidence =
    spanCount === 0
      ? 0
      : result.spans.reduce((sum, s) => sum + s.confidence, 0) / spanCount;

  return {
    ...result,
    text,
    spanCount,
    averageConfidence: Math.round(averageConfidence * 1000) / 1000,
  };
}

export function formatSpanWhyHighlighted(span: {
  type: string;
  subtype?: string;
  detectionSource: string;
  evidencePhrases: string[];
  contextWindow: { before: string; match: string; after: string };
  alternatives: Array<{ type: string; confidence: number; reason?: string }>;
  rulesFired?: string[];
}): {
  detectedBecause: string;
  contextWords: string[];
  alternatives: string[];
} {
  const detectedBecause =
    span.detectionSource === 'pattern'
      ? `Phrase matched ${span.type}${span.subtype ? ` / ${span.subtype}` : ''} pattern${span.rulesFired?.length ? `: ${span.rulesFired.join(', ')}` : ''}`
      : `${span.detectionSource} signal → ${span.type}`;

  const contextWords = `${span.contextWindow.before} ${span.contextWindow.after}`
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(-6);

  const alternatives = span.alternatives.map(
    (a) => `${a.type} ${Math.round(a.confidence * 100)}%${a.reason ? ` (${a.reason})` : ''}`
  );

  return { detectedBecause, contextWords, alternatives };
}
