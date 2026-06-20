import { describe, it, expect, beforeEach } from 'vitest';
import { SpanIntervalIndex, spansOverlap } from '../../src/services/lexical/intelligence/spanIntervalIndex';
import { resolveSpanOverlaps } from '../../src/services/lexical/intelligence/overlapResolutionService';
import { runLexicalIntelligence } from '../../src/services/lexical/intelligence/lexicalIntelligenceService';
import {
  clearIntelligenceCache,
  intelligenceCacheSize,
} from '../../src/services/lexical/intelligence/lexicalIntelligenceCache';
import { fuseLogOddsConfidence } from '../../src/services/lexical/intelligence/logOddsConfidence';
import { lexicalAnalyzerService } from '../../src/services/lexical/lexicalAnalyzerService';
import { LEXICAL_FIXTURE_PACK, assertFixtureExpectations } from '../../src/services/lexical/intelligence/lexicalFixtureRunner';
import { SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_TEXT } from '../fixtures/schoolDetentionLunchFootballTeamFriends';

describe('SpanIntervalIndex', () => {
  it('finds tightest container', () => {
    const index = new SpanIntervalIndex<{ start: number; end: number; id: string }>();
    index.add({ start: 0, end: 100, id: 'outer' });
    index.add({ start: 10, end: 50, id: 'inner' });

    expect(index.findTightestContainer(15, 20)?.id).toBe('inner');
    expect(index.findTightestContainer(5, 90)?.id).toBe('outer');
  });

  it('detects overlap', () => {
    expect(spansOverlap({ start: 0, end: 10 }, { start: 5, end: 15 })).toBe(true);
    expect(spansOverlap({ start: 0, end: 5 }, { start: 5, end: 10 })).toBe(false);
  });
});

describe('analyzeMessageLite', () => {
  it('returns the same entity surfaces as full analyze for school fixture', () => {
    const input = { userId: 'u', messageId: 'm', text: SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_TEXT };
    const lite = lexicalAnalyzerService.analyzeMessageLite(input);
    const full = lexicalAnalyzerService.analyzeMessage(input);

    const liteSurfaces = new Set(lite.entities.map((e) => e.surface.toLowerCase()));
    for (const e of full.entities) {
      expect(liteSurfaces.has(e.surface.toLowerCase()), e.surface).toBe(true);
    }
  });
});

describe('runLexicalIntelligence lite vs full parity', () => {
  for (const spec of LEXICAL_FIXTURE_PACK.filter((s) => s.mode !== 'analyzer')) {
    it(`${spec.id} — lite mode matches fixture expectations`, () => {
      const result = runLexicalIntelligence({
        text: spec.text,
        includeAlternatives: true,
        analyzerMode: 'lite',
      });
      assertFixtureExpectations(spec, result);
    });
  }
});

describe('lexical intelligence cache', () => {
  beforeEach(() => clearIntelligenceCache());

  it('returns cached result for identical input', () => {
    const text = SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_TEXT;
    const a = runLexicalIntelligence({ text, useCache: true });
    expect(intelligenceCacheSize()).toBe(1);
    const b = runLexicalIntelligence({ text, useCache: true });
    expect(b).toBe(a);
  });

  it('bypasses cache when useCache is false', () => {
    const text = SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_TEXT;
    runLexicalIntelligence({ text, useCache: false });
    expect(intelligenceCacheSize()).toBe(0);
  });
});

describe('log-odds confidence fusion', () => {
  it('boosts confidence when strong rules fire', () => {
    const base = fuseLogOddsConfidence({
      baseConfidence: 0.82,
      rulesFired: ['friend_group_from_team'],
      detectionSource: 'pattern',
    });
    const plain = fuseLogOddsConfidence({
      baseConfidence: 0.82,
      rulesFired: [],
      detectionSource: 'pattern',
    });
    expect(base.confidence).toBeGreaterThan(plain.confidence);
  });
});

describe('lexical intelligence perf guard', () => {
  it('processes a long composer-sized message within a reasonable budget', () => {
    const paragraph = `${SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_TEXT} `.repeat(40);
    const start = performance.now();
    const result = runLexicalIntelligence({
      text: paragraph,
      analyzerMode: 'lite',
      includeAlternatives: false,
    });
    const elapsed = performance.now() - start;

    expect(result.spans.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(250);
  });
});

describe('overlap resolution with interval index', () => {
  it('keeps parent travel event and nested place', () => {
    const spans = [
      {
        id: '0:8:EVENT',
        text: 'went to Japan',
        start: 0,
        end: 13,
        type: 'EVENT' as const,
        subtype: 'TRAVEL_EVENT',
        confidence: 0.9,
        evidencePhrases: [],
        contextWindow: { before: '', match: 'went to Japan', after: '' },
        detectionSource: 'pattern' as const,
        alternatives: [],
        status: 'new' as const,
        colorKey: 'event',
      },
      {
        id: '8:13:PLACE',
        text: 'Japan',
        start: 8,
        end: 13,
        type: 'TRAVEL_DESTINATION' as const,
        confidence: 0.88,
        evidencePhrases: [],
        contextWindow: { before: 'went to ', match: 'Japan', after: '' },
        detectionSource: 'pattern' as const,
        alternatives: [],
        status: 'new' as const,
        colorKey: 'place',
      },
    ];

    const { spans: resolved } = resolveSpanOverlaps(spans);
    expect(resolved).toHaveLength(2);
    expect(resolved.find((s) => s.text === 'Japan')?.parentSpanId).toBeDefined();
  });
});
