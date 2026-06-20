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
  patternId?: string;
  patternLiteral?: string;
  patternRegexSource?: string;
  confidence?: number;
  needsReview?: boolean;
}): {
  detectedBecause: string;
  contextWords: string[];
  alternatives: string[];
  patternSource: string;
} {
  const patternSource = span.patternLiteral
    ? `literal:"${span.patternLiteral}"`
    : span.patternRegexSource
      ? `regex:${span.patternRegexSource}`
      : span.patternId ?? 'n/a';

  const detectedBecause =
    span.detectionSource === 'pattern'
      ? `Pattern ${patternSource} → ${span.type}${span.subtype ? ` / ${span.subtype}` : ''}${span.rulesFired?.length ? ` (${span.rulesFired.join(', ')})` : ''}`
      : `${span.detectionSource} signal → ${span.type}`;

  const contextWords = `${span.contextWindow.before} ${span.contextWindow.after}`
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(-6);

  const alternatives = span.alternatives.map(
    (a) => `${a.type} ${Math.round(a.confidence * 100)}%${a.reason ? ` (${a.reason})` : ''}`
  );

  return { detectedBecause, contextWords, alternatives, patternSource };
}
