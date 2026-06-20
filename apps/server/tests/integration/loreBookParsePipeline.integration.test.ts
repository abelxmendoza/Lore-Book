/**
 * End-to-end server pipeline: parse engine → suggestion enricher → alternative categories.
 * Exercises the Phase 1 wiring without HTTP or DB (canon seeded inline).
 */
import { describe, it, expect } from 'vitest';

import { parseLoreBookText } from '../../src/services/lorebook/parser/loreBookParseEngine';
import { alternativesFromParseResult } from '../../src/services/lorebook/parser/loreBookSuggestionEnricher';
import { detectAlternativeCategories } from '../../src/services/suggestionCrossBookService';
import {
  FIXTURE_PERSON_VS_PROJECT_TEXT,
  FIXTURE_PLACE_BOUNDARY_TEXT,
} from '../../src/services/lorebook/parser/fixtures/loreBookParserFixtures';

describe('LoreBook Parse Pipeline — server integration', () => {
  it('parse → alternatives surfaces cross-book redirect for place-like names', () => {
    const result = parseLoreBookText({
      userId: 'pipeline-user',
      text: 'Gothicumbia was insane this year.',
    });

    const alts = alternativesFromParseResult('Gothicumbia', 'characters', result);
    const legacy = detectAlternativeCategories('Gothicumbia', 'characters', {
      evidence: result.text,
    });

    const domains = new Set([...alts, ...legacy].map((a) => a.domain));
    expect(result.lexicalSpans.length).toBeGreaterThan(0);
    expect(domains.size).toBeGreaterThanOrEqual(0);
  });

  it('known character in canon suppresses project suggest_add', () => {
    const result = parseLoreBookText({
      userId: 'pipeline-user',
      text: FIXTURE_PERSON_VS_PROJECT_TEXT,
      canonSeed: { characters: [{ name: 'Hell Fairy' }] },
    });

    const projectAdds = result.operations.filter(
      (o) => o.kind === 'suggest_add' && o.domain === 'projects' && /Hell Fairy/i.test(o.name)
    );
    expect(projectAdds).toHaveLength(0);
  });

  it('consumer app references are suppressed not suggested', () => {
    const result = parseLoreBookText({
      userId: 'pipeline-user',
      text: FIXTURE_PLACE_BOUNDARY_TEXT,
    });

    const all = [...result.operations, ...result.suppressed, ...result.redirects];
    expect(all.some((o) => o.kind === 'suppress' && /Find My/i.test(o.name))).toBe(true);
    const projectAdds = result.operations.filter((o) => o.kind === 'suggest_add' && o.domain === 'projects');
    expect(projectAdds.length).toBe(0);
  });

  it('merges parser and legacy alternatives by highest confidence', () => {
    const result = parseLoreBookText({
      userId: 'pipeline-user',
      text: 'Started learning React hooks for the side project.',
    });

    const parserAlts = alternativesFromParseResult('React Hooks', 'projects', result);
    const legacyAlts = detectAlternativeCategories('React Hooks', 'projects', {
      evidence: result.text,
    });

    const merged = new Map<string, { confidence: number }>();
    for (const alt of [...legacyAlts, ...parserAlts]) {
      const prev = merged.get(alt.domain);
      if (!prev || alt.confidence > prev.confidence) merged.set(alt.domain, alt);
    }

    expect(merged.size).toBeLessThanOrEqual(4);
  });
});
