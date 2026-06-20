import {
  PREVIEW_PATTERNS,
  type PreviewPattern,
  literalPhrases,
  hasWordBoundary,
  patternConfidence,
  patternNeedsReview,
} from '../lexicalPreviewPatterns';
import type { EntityType, RawSpanCandidate } from './lexicalIntelligenceTypes';
import { normalizeEntityType } from './lexicalEntityTaxonomy';
import { AhoCorasickMatcher } from './ahoCorasickMatcher';

export type RegistryPattern = PreviewPattern;

type LiteralBinding = {
  pattern: RegistryPattern;
  phrase: string;
  acPatternId: number;
};

export const LEXICAL_PATTERN_REGISTRY: RegistryPattern[] = [...PREVIEW_PATTERNS];

function buildPatternEngine(): {
  automaton: AhoCorasickMatcher;
  acIdToBinding: Map<number, LiteralBinding>;
  regexPatterns: RegistryPattern[];
} {
  const automaton = new AhoCorasickMatcher();
  const acIdToBinding = new Map<number, LiteralBinding>();
  const regexPatterns: RegistryPattern[] = [];

  for (const pattern of LEXICAL_PATTERN_REGISTRY) {
    if (pattern.literal) {
      for (const phrase of literalPhrases(pattern)) {
        const acPatternId = automaton.register({
          phrase,
          caseInsensitive: !pattern.caseSensitive,
        });
        acIdToBinding.set(acPatternId, { pattern, phrase, acPatternId });
      }
    } else if (pattern.regex) {
      regexPatterns.push(pattern);
    }
  }

  automaton.build();
  return { automaton, acIdToBinding, regexPatterns };
}

let patternEngine = buildPatternEngine();

function candidateFromPattern(
  pattern: RegistryPattern,
  text: string,
  start: number,
  end: number
): RawSpanCandidate {
  return {
    text: text.slice(start, end),
    start,
    end,
    type: normalizeEntityType(pattern.type, pattern.subtype),
    subtype: pattern.subtype,
    baseConfidence: patternConfidence(pattern),
    detectionSource: 'pattern',
    patternId: pattern.id,
    patternLiteral: pattern.literal ?? pattern.literalVariants?.[0],
    patternRegexSource: pattern.regex?.source,
    evidencePhrases: [pattern.literal ?? pattern.regex?.source ?? pattern.id],
    needsReview: patternNeedsReview(pattern),
  };
}

function extractLiteralCandidates(text: string): RawSpanCandidate[] {
  const out: RawSpanCandidate[] = [];
  const matches = patternEngine.automaton.search(text);

  for (const match of matches) {
    const binding = patternEngine.acIdToBinding.get(match.patternId);
    if (!binding) continue;
    if (!hasWordBoundary(text, match.start, match.end)) continue;
    out.push(candidateFromPattern(binding.pattern, text, match.start, match.end));
  }

  return out;
}

function extractRegexCandidates(text: string): RawSpanCandidate[] {
  const out: RawSpanCandidate[] = [];

  for (const pattern of patternEngine.regexPatterns) {
    if (!pattern.regex) continue;
    pattern.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.regex.exec(text)) !== null) {
      const surface = m[0];
      out.push({
        text: surface,
        start: m.index,
        end: m.index + surface.length,
        type: normalizeEntityType(pattern.type, pattern.subtype),
        subtype: pattern.subtype,
        baseConfidence: patternConfidence(pattern),
        detectionSource: 'pattern',
        patternId: pattern.id,
        patternRegexSource: pattern.regex.source,
        evidencePhrases: [pattern.id],
        needsReview: patternNeedsReview(pattern),
      });
    }
  }

  return out;
}

/** Single-pass literal scan (Aho–Corasick) + regex pass for dynamic patterns. */
export function extractPatternCandidates(text: string): RawSpanCandidate[] {
  return [...extractLiteralCandidates(text), ...extractRegexCandidates(text)];
}

export function getPatternById(id: string): RegistryPattern | undefined {
  return LEXICAL_PATTERN_REGISTRY.find((p) => p.id === id);
}

export function registryRuleIds(): string[] {
  return [...new Set(LEXICAL_PATTERN_REGISTRY.flatMap((p) => p.contextRules ?? [p.id]))];
}

export function patternEngineStats(): {
  totalPatterns: number;
  literalPhrases: number;
  regexPatterns: number;
} {
  return {
    totalPatterns: LEXICAL_PATTERN_REGISTRY.length,
    literalPhrases: patternEngine.acIdToBinding.size,
    regexPatterns: patternEngine.regexPatterns.length,
  };
}

export function rebuildPatternEngineForTests(): void {
  patternEngine = buildPatternEngine();
}
