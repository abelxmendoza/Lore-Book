import { PREVIEW_PATTERNS, type PreviewPattern } from '../lexicalPreviewPatterns';
import type { EntityType, RawSpanCandidate } from './lexicalIntelligenceTypes';
import { normalizeEntityType } from './lexicalEntityTaxonomy';
import { AhoCorasickMatcher } from './ahoCorasickMatcher';
import { hasWordBoundary, tryParseLiteralRegex } from './literalPatternParser';

export type RegistryPattern = PreviewPattern & {
  id: string;
  ruleName: string;
  evidenceTemplate: string;
};

type LiteralBinding = {
  pattern: RegistryPattern;
  phrase: string;
  acPatternId: number;
};

function pat(
  id: string,
  ruleName: string,
  evidenceTemplate: string,
  pattern: PreviewPattern
): RegistryPattern {
  return { ...pattern, id, ruleName, evidenceTemplate };
}

/** Supplemental patterns not yet in shared PREVIEW_PATTERNS. */
const SUPPLEMENTAL: RegistryPattern[] = [
  pat('neighborhood_gardening', 'activity_gardening', 'gardening outside', {
    re: /\bgardening\b/gi,
    type: 'ACTIVITY',
    subtype: 'OUTDOOR',
    colorKey: 'work_activity',
    confidence: 0.84,
    priority: 26,
  }),
  pat('neighborhood_fix_bike', 'activity_bike_repair', 'fixing his bike', {
    re: /\bfixing\s+(?:his|her|their)\s+bike\b/gi,
    type: 'ACTIVITY',
    subtype: 'BIKE_REPAIR',
    colorKey: 'work_activity',
    confidence: 0.86,
    needsReview: true,
    priority: 25,
  }),
  pat('neighborhood_coding_club', 'school_club_after_school', 'after school Coding Club', {
    re: /\b(?:our|my|the)\s+(?:after\s+school\s+)?coding\s+club\b/gi,
    type: 'GROUP',
    subtype: 'SCHOOL_CLUB',
    colorKey: 'group',
    confidence: 0.9,
    needsReview: true,
    priority: 24,
  }),
  pat('neighborhood_wild_rivers', 'place_street', 'Wild Rivers Street', {
    re: /\bWild Rivers Street\b/gi,
    type: 'PLACE',
    subtype: 'STREET',
    colorKey: 'place',
    confidence: 0.88,
    priority: 23,
  }),
  pat('travel_went_to_japan', 'travel_event', 'went to Japan', {
    re: /\bwent to Japan\b/gi,
    type: 'EVENT',
    subtype: 'TRAVEL_EVENT',
    colorKey: 'event',
    confidence: 0.87,
    priority: 22,
  }),
  pat('travel_japan_destination', 'travel_destination', 'Japan travel destination', {
    re: /\bJapan\b/g,
    type: 'PLACE',
    subtype: 'country',
    colorKey: 'place',
    confidence: 0.95,
    priority: 36,
  }),
  pat('travel_japanese_class', 'school_class', 'school Japanese Class', {
    re: /\b(?:school\s+)?Japanese Class\b/g,
    type: 'GROUP',
    subtype: 'SCHOOL_CLASS',
    colorKey: 'group',
    confidence: 0.9,
    priority: 21,
  }),
  pat('travel_favorite_clothes', 'preference_clothes', 'favorite summer clothes', {
    re: /\bfavorite summer clothes\b/gi,
    type: 'OBJECT',
    subtype: 'PREFERENCE',
    colorKey: 'preference',
    confidence: 0.82,
    priority: 20,
  }),
  pat('workplace_coworker_gary', 'coworker_name', 'with Gary', {
    re: /\bGary\b/g,
    type: 'PERSON',
    subtype: 'COWORKER',
    colorKey: 'person',
    confidence: 0.88,
    priority: 37,
  }),
  pat('workplace_robot_tech', 'role_robot_tech', 'robot tech role', {
    re: /\brobot tech\b/gi,
    type: 'ROLE',
    subtype: 'JOB_TITLE',
    colorKey: 'role',
    confidence: 0.9,
    priority: 38,
  }),
  pat('object_bike', 'object_bike', 'bike', {
    re: /\bbike\b/gi,
    type: 'OBJECT',
    subtype: 'VEHICLE',
    colorKey: 'uncertain',
    confidence: 0.75,
    priority: 5,
  }),
];

function previewToRegistry(p: PreviewPattern, index: number): RegistryPattern {
  return pat(
    `preview_${index}_${p.type.toLowerCase()}`,
    `pattern_${p.subtype?.toLowerCase() ?? p.type.toLowerCase()}`,
    p.subtype ? `${p.type} / ${p.subtype}` : p.type,
    p
  );
}

export const LEXICAL_PATTERN_REGISTRY: RegistryPattern[] = [
  ...PREVIEW_PATTERNS.map(previewToRegistry),
  ...SUPPLEMENTAL,
].sort((a, b) => b.priority - a.priority);

function buildPatternEngine(): {
  automaton: AhoCorasickMatcher;
  acIdToBinding: Map<number, LiteralBinding>;
  regexPatterns: RegistryPattern[];
} {
  const automaton = new AhoCorasickMatcher();
  const acIdToBinding = new Map<number, LiteralBinding>();
  const regexPatterns: RegistryPattern[] = [];

  for (const pattern of LEXICAL_PATTERN_REGISTRY) {
    const parsed = tryParseLiteralRegex(pattern.re);
    if (!parsed) {
      regexPatterns.push(pattern);
      continue;
    }

    for (const phrase of parsed.phrases) {
      const acPatternId = automaton.register({
        phrase,
        caseInsensitive: parsed.caseInsensitive,
      });
      acIdToBinding.set(acPatternId, { pattern, phrase, acPatternId });
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
    baseConfidence: pattern.confidence,
    detectionSource: 'pattern',
    patternId: pattern.id,
    evidencePhrases: [pattern.evidenceTemplate],
    needsReview: pattern.needsReview,
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
    pattern.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.re.exec(text)) !== null) {
      const surface = m[0];
      out.push({
        text: surface,
        start: m.index,
        end: m.index + surface.length,
        type: normalizeEntityType(pattern.type, pattern.subtype),
        subtype: pattern.subtype,
        baseConfidence: pattern.confidence,
        detectionSource: 'pattern',
        patternId: pattern.id,
        evidencePhrases: [pattern.evidenceTemplate],
        needsReview: pattern.needsReview,
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
  return [...new Set(LEXICAL_PATTERN_REGISTRY.map((p) => p.ruleName))];
}

/** Test / diagnostics */
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
