/**
 * Debug reporter for LoreBook Parse Engine — fixture and dev introspection.
 */

import type { LexicalIntelligenceSpan } from '../../lexical/intelligence/lexicalIntelligenceTypes';
import type { LoreBookParseDebug, LoreBookParseResult, LoreBookOperation } from './loreBookParserTypes';

export function buildParserDebugReport(result: LoreBookParseResult): LoreBookParseResult['debug'] {
  return result.debug;
}

export function summarizeParseResult(result: LoreBookParseResult): {
  operationCount: number;
  suppressedCount: number;
  redirectCount: number;
  spanCount: number;
  kinds: Record<string, number>;
  averageConfidence: number;
} {
  const kinds: Record<string, number> = {};
  let confidenceSum = 0;
  let confidenceN = 0;

  for (const op of result.operations) {
    kinds[op.kind] = (kinds[op.kind] ?? 0) + 1;
    if ('confidence' in op && typeof op.confidence === 'number') {
      confidenceSum += op.confidence;
      confidenceN += 1;
    }
  }

  return {
    operationCount: result.operations.length,
    suppressedCount: result.suppressed.length,
    redirectCount: result.redirects.length,
    spanCount: result.lexicalSpans.length,
    kinds,
    averageConfidence: confidenceN > 0 ? confidenceSum / confidenceN : 0,
  };
}

export function formatOperation(op: LoreBookOperation): string {
  switch (op.kind) {
    case 'suggest_add':
      return `suggest_add ${op.domain}:${op.name} [${op.gate}]`;
    case 'suggest_merge':
      return `suggest_merge ${op.domain}:${op.name} → ${op.targetName}`;
    case 'redirect':
      return `redirect ${op.fromDomain}→${op.toDomain}:${op.name}`;
    case 'link':
      return `link ${op.fromEntity.name} -${op.relationType}-> ${op.toEntity.name}`;
    case 'update_attribute':
      return `update_attribute ${op.domain}:${op.entityId}.${op.field}`;
    case 'attach_evidence':
      return `attach_evidence ${op.domain}:${op.entityId}`;
    case 'suppress':
      return `suppress ${op.name} (${op.reason})`;
    default:
      return 'unknown';
  }
}

export function debugSpanTypes(spans: LexicalIntelligenceSpan[]): Array<{ type: string; count: number }> {
  const counts = new Map<string, number>();
  for (const span of spans) {
    counts.set(span.type, (counts.get(span.type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => ({ type, count }));
}
