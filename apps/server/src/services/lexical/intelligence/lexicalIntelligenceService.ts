import { lexicalAnalyzerService } from '../lexicalAnalyzerService';
import type { LexicalEntity } from '../lexicalTypes';
import { extractPatternCandidates } from './lexicalPatternRegistry';
import { applyContextRules, buildContextRuleSession, contextCuesFromWindow, extractContextWindow } from './contextWindowScorer';
import { scoreSpanConfidence } from './spanConfidenceScorer';
import { filterNoiseSpans, resolveSpanOverlaps } from './overlapResolutionService';
import { colorKeyForType, normalizeEntityType } from './lexicalEntityTaxonomy';
import {
  getCachedIntelligence,
  intelligenceCacheKey,
  setCachedIntelligence,
} from './lexicalIntelligenceCache';
import type {
  DetectionSource,
  LexicalIntelligenceResult,
  LexicalIntelligenceSpan,
  RawSpanCandidate,
  SpanStatus,
} from './lexicalIntelligenceTypes';

function spanId(start: number, end: number, type: string): string {
  return `${start}:${end}:${type}`;
}

function entityToCandidate(text: string, entity: LexicalEntity): RawSpanCandidate | null {
  const idx = text.indexOf(entity.surface);
  if (idx < 0) {
    const re = new RegExp(entity.surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const m = re.exec(text);
    if (!m) return null;
    return {
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
      type: normalizeEntityType(entity.type, entity.subcategory),
      subtype: entity.subcategory,
      baseConfidence: entity.confidence,
      detectionSource: 'model' as DetectionSource,
      evidencePhrases: [entity.source || 'lexical_analyzer'],
    };
  }
  return {
    text: text.slice(idx, idx + entity.surface.length),
    start: idx,
    end: idx + entity.surface.length,
    type: normalizeEntityType(entity.type, entity.subcategory),
    subtype: entity.subcategory,
    baseConfidence: entity.confidence,
    detectionSource: 'model',
    evidencePhrases: [entity.source || 'lexical_analyzer'],
  };
}

function pickBetterCandidate(a: RawSpanCandidate, b: RawSpanCandidate): RawSpanCandidate {
  const score = (c: RawSpanCandidate) => {
    let s = c.baseConfidence;
    if (c.detectionSource === 'pattern') s += 0.06;
    if (c.type === 'PLACE' || c.type === 'TRAVEL_DESTINATION' || c.type === 'DEPLOYMENT_SITE') s += 0.04;
    if (c.type === 'PERSON' && c.subtype === 'COWORKER') s += 0.03;
    if (c.type === 'EVENT' || c.type === 'MUSIC_GENRE') s += 0.03;
    if (c.type === 'PERSON' && c.subtype === 'FULL_NAME' && c.text.split(/\s+/).length <= 2) s -= 0.04;
    return s;
  };
  return score(b) > score(a) ? b : a;
}

function cue(text: string): string {
  return text.toLowerCase();
}

function engulfingPatternIndex(patterns: RawSpanCandidate[]): RawSpanCandidate[] {
  return [...patterns].sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Drop broad analyzer spans when narrower pattern hits exist inside them. */
function dropEngulfingModelCandidates(candidates: RawSpanCandidate[]): RawSpanCandidate[] {
  const patterns = engulfingPatternIndex(candidates.filter((c) => c.detectionSource === 'pattern'));
  if (patterns.length === 0) return candidates;

  return candidates.filter((c) => {
    if (c.detectionSource !== 'model') return true;
    for (const p of patterns) {
      if (p.start >= c.end) break;
      if (p.start >= c.start && p.end <= c.end && p.end - p.start < c.end - c.start) return false;
    }
    return true;
  });
}

function mergeCandidates(candidates: RawSpanCandidate[]): RawSpanCandidate[] {
  const filtered = dropEngulfingModelCandidates(candidates);
  const byRange = new Map<string, RawSpanCandidate>();
  for (const c of filtered) {
    const key = `${c.start}:${c.end}`;
    const existing = byRange.get(key);
    if (!existing) {
      byRange.set(key, c);
      continue;
    }
    byRange.set(key, pickBetterCandidate(existing, c));
  }
  return [...byRange.values()];
}

function toIntelligenceSpan(
  text: string,
  candidate: RawSpanCandidate,
  includeAlternatives: boolean,
  session: ReturnType<typeof buildContextRuleSession>
): LexicalIntelligenceSpan {
  const window = extractContextWindow(text, candidate.start, candidate.end);
  const context = applyContextRules(text, candidate, { window, session });
  const scored = scoreSpanConfidence({ ...candidate, context });
  contextCuesFromWindow(window);

  let status: SpanStatus = 'new';
  if (context.needsReview || candidate.needsReview) status = 'needs_review';
  if ((scored.classificationEntropy ?? 0) > 1.35 && status === 'new') status = 'needs_review';

  return {
    id: spanId(candidate.start, candidate.end, context.type),
    text: candidate.text,
    start: candidate.start,
    end: candidate.end,
    type: context.type,
    subtype: context.subtype,
    confidence: scored.confidence,
    evidencePhrases: context.evidencePhrases,
    contextWindow: window,
    detectionSource: candidate.detectionSource,
    alternatives: includeAlternatives ? scored.alternatives : [],
    status,
    rulesFired: context.rulesFired,
    colorKey: colorKeyForType(context.type, context.subtype),
    needsReview: context.needsReview ?? candidate.needsReview,
    patternId: candidate.patternId,
    patternLiteral: candidate.patternLiteral,
    patternRegexSource: candidate.patternRegexSource,
  };
}

export function runLexicalIntelligence(input: {
  text: string;
  userId?: string;
  includeAlternatives?: boolean;
  includeAnalyzerEntities?: boolean;
  /** lite skips ontology/memory/entity-link work — default for preview paths */
  analyzerMode?: 'lite' | 'full';
  /** LRU cache for identical text/options — default true */
  useCache?: boolean;
}): LexicalIntelligenceResult {
  const {
    text,
    includeAlternatives = true,
    includeAnalyzerEntities = true,
    analyzerMode = 'lite',
    useCache = true,
  } = input;
  const warnings: string[] = [];
  const rulesFired = new Set<string>();

  if (!text.trim()) {
    return { spans: [], rulesFired: [], overlapsResolved: [], missedCandidates: [], warnings: [] };
  }

  const cacheKey = intelligenceCacheKey({
    text,
    userId: input.userId,
    includeAlternatives,
    includeAnalyzerEntities,
    analyzerMode,
  });

  if (useCache) {
    const cached = getCachedIntelligence(cacheKey);
    if (cached) return cached;
  }

  const session = buildContextRuleSession(text);
  const patternCandidates = extractPatternCandidates(text);
  let candidates = [...patternCandidates];

  if (includeAnalyzerEntities) {
    const analyzeInput = {
      userId: input.userId ?? 'intelligence-ephemeral',
      messageId: 'intelligence-ephemeral',
      text,
    };
    const lexical =
      analyzerMode === 'full'
        ? lexicalAnalyzerService.analyzeMessage(analyzeInput)
        : lexicalAnalyzerService.analyzeMessageLite(analyzeInput);
    for (const entity of lexical.entities) {
      const c = entityToCandidate(text, entity);
      if (c) candidates.push(c);
    }
    warnings.push(...lexical.ambiguityFlags.map((f) => `ambiguity:${f}`));
  }

  candidates = mergeCandidates(candidates);

  let spans = candidates.map((c) => toIntelligenceSpan(text, c, includeAlternatives, session));
  for (const s of spans) {
    for (const r of s.rulesFired ?? []) rulesFired.add(r);
  }

  spans = filterNoiseSpans(spans);
  const { spans: resolved, overlapsResolved, warnings: overlapWarnings } = resolveSpanOverlaps(spans);
  warnings.push(...overlapWarnings);

  const result: LexicalIntelligenceResult = {
    spans: resolved,
    rulesFired: [...rulesFired],
    overlapsResolved,
    missedCandidates: [],
    warnings: [...new Set(warnings)],
  };

  if (useCache) setCachedIntelligence(cacheKey, result);
  return result;
}

/** Map intelligence span → composer preview span (backward compatible). */
export function intelligenceSpanToPreview(span: LexicalIntelligenceSpan) {
  return {
    text: span.text,
    start: span.start,
    end: span.end,
    type: span.type === 'SCHOOL_CLUB' || span.type === 'SCHOOL_TEAM' || span.type === 'FRIEND_GROUP'
      ? 'GROUP'
      : span.type,
    subtype:
      span.type === 'SCHOOL_CLUB'
        ? 'SCHOOL_CLUB'
        : span.type === 'SCHOOL_TEAM'
          ? 'SCHOOL_TEAM'
          : span.type === 'FRIEND_GROUP'
            ? 'SOCIAL_GROUP'
            : span.subtype,
    colorKey: span.colorKey ?? colorKeyForType(span.type, span.subtype),
    confidence: span.confidence,
    temporary: true as const,
    needsReview: span.needsReview ?? span.status === 'needs_review',
    entityStatus: span.status === 'known' ? ('known' as const) : ('new' as const),
  };
}

export function findIntelligenceSpan(
  result: LexicalIntelligenceResult,
  re: RegExp
): LexicalIntelligenceSpan | undefined {
  return result.spans.find((s) => re.test(s.text));
}
