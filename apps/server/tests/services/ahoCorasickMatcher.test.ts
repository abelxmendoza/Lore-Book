import { describe, it, expect } from 'vitest';
import { AhoCorasickMatcher } from '../../src/services/lexical/intelligence/ahoCorasickMatcher';
import { hasWordBoundary } from '../../src/services/lexical/previewPatternTypes';
import {
  extractPatternCandidates,
  patternEngineStats,
} from '../../src/services/lexical/intelligence/lexicalPatternRegistry';
import { runLexicalIntelligence } from '../../src/services/lexical/intelligence/lexicalIntelligenceService';
import { SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_TEXT } from '../fixtures/schoolDetentionLunchFootballTeamFriends';

describe('AhoCorasickMatcher', () => {
  it('finds multiple literals in one pass', () => {
    const ac = new AhoCorasickMatcher();
    ac.register({ phrase: 'best friend', caseInsensitive: true });
    ac.register({ phrase: 'detention', caseInsensitive: true });
    ac.build();

    const text = 'my best friend got detention';
    const matches = ac.search(text);
    expect(matches).toHaveLength(2);
    expect(text.slice(matches[0]!.start, matches[0]!.end)).toBe('best friend');
    expect(text.slice(matches[1]!.start, matches[1]!.end)).toBe('detention');
  });

  it('respects case-sensitive phrases', () => {
    const ac = new AhoCorasickMatcher();
    ac.register({ phrase: 'Japan', caseInsensitive: false });
    ac.build();

    expect(ac.search('I went to Japan')).toHaveLength(1);
    expect(ac.search('I went to japan')).toHaveLength(0);
  });
});

describe('extractPatternCandidates with explicit literals', () => {
  it('routes most patterns through the automaton', () => {
    const stats = patternEngineStats();
    expect(stats.literalPhrases).toBeGreaterThanOrEqual(25);
    expect(stats.regexPatterns).toBeLessThan(30);
  });

  it('matches school fixture spans', () => {
    const candidates = extractPatternCandidates(SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_TEXT);
    expect(candidates.some((c) => /coding club at school/i.test(c.text))).toBe(true);
    expect(candidates.some((c) => /detention/i.test(c.text))).toBe(true);
    expect(candidates.some((c) => /friends from the football team/i.test(c.text))).toBe(true);
  });

  it('keeps intelligence fixture parity', () => {
    const result = runLexicalIntelligence({ text: SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_TEXT });
    expect(result.spans.some((s) => /Abel Mendoza/i.test(s.text))).toBe(true);
    expect(result.spans.some((s) => s.type === 'FRIEND_GROUP')).toBe(true);
  });
});

describe('word boundaries', () => {
  it('blocks partial token matches', () => {
    expect(hasWordBoundary('foobar', 3, 6)).toBe(false);
    expect(hasWordBoundary('got detention', 4, 13)).toBe(true);
  });
});

describe('Aho–Corasick perf guard', () => {
  it('scans a long paragraph quickly', () => {
    const text = `${SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_TEXT} `.repeat(80);
    const start = performance.now();
    extractPatternCandidates(text);
    expect(performance.now() - start).toBeLessThan(80);
  });
});
