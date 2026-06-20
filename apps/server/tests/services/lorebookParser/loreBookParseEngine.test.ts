import { describe, it, expect } from 'vitest';

import { parseLoreBookText } from '../../../src/services/lorebook/parser/loreBookParseEngine';
import {
  LOREBOOK_PARSER_FIXTURE_PACK,
  assertFixturePackIdsUnique,
  assertLoreBookParserFixture,
  runLoreBookParserFixture,
  FIXTURE_CONSUMER_TOOLS_TEXT,
  FIXTURE_FAMILY_HOUSEHOLD_TEXT,
  FIXTURE_PERSON_VS_PROJECT_TEXT,
  FIXTURE_PLACE_BOUNDARY_TEXT,
  FIXTURE_PROJECT_TRUE_POSITIVE_TEXT,
  FIXTURE_SCHOOL_MEMORY_TEXT,
  FIXTURE_WORKSITE_EMPLOYER_TEXT,
  findMatchingOperations,
} from '../../../src/services/lorebook/parser/fixtures/loreBookParserFixtures';
import { summarizeParseResult } from '../../../src/services/lorebook/parser/parserDebugReporter';

describe('LoreBook Parse Engine — Phase 0', () => {
  it('fixture pack has unique ids', () => {
    assertFixturePackIdsUnique();
  });

  it('parser returns operations without DB writes (read-only)', () => {
    const result = parseLoreBookText({
      userId: 'test-user',
      text: FIXTURE_PROJECT_TRUE_POSITIVE_TEXT,
      includeDebug: true,
    });
    expect(result.operations.length).toBeGreaterThan(0);
    expect(result.userId).toBe('test-user');
    expect(result.lexicalSpans.length).toBeGreaterThan(0);
    expect(result.debug?.canonMatches).toBeDefined();
  });

  it('known character blocks project suggestion for Hell Fairy', () => {
    const result = runLoreBookParserFixture({
      id: 'inline_hell_fairy',
      text: FIXTURE_PERSON_VS_PROJECT_TEXT,
      canonSeed: { characters: [{ name: 'Hell Fairy' }] },
      expected: [],
      forbidden: [{ kind: 'suggest_add', domain: 'projects', nameMatch: /Hell Fairy/i }],
    });
    assertLoreBookParserFixture(
      {
        id: 'inline_hell_fairy',
        text: FIXTURE_PERSON_VS_PROJECT_TEXT,
        canonSeed: { characters: [{ name: 'Hell Fairy' }] },
        expected: [],
        forbidden: [{ kind: 'suggest_add', domain: 'projects', nameMatch: /Hell Fairy/i }],
      },
      result
    );
  });

  it('project duplicate attaches evidence instead of duplicate add', () => {
    const result = parseLoreBookText({
      userId: 'test-user',
      text: 'Shipping LoreBook app beta.',
      canonSeed: { projects: [{ id: 'p1', name: 'LoreBook App' }] },
    });
    expect(
      result.operations.some((o) => o.kind === 'attach_evidence' && o.domain === 'projects')
    ).toBe(true);
  });

  it('place boundaries do not leak junk project suggestions', () => {
    const result = parseLoreBookText({
      userId: 'test-user',
      text: FIXTURE_PLACE_BOUNDARY_TEXT,
    });
    const projectAdds = result.operations.filter(
      (o) => o.kind === 'suggest_add' && o.domain === 'projects'
    );
    expect(projectAdds.length).toBe(0);
    const all = [...result.operations, ...result.suppressed];
    expect(all.some((s) => s.kind === 'suppress' && /Find My/i.test(s.name))).toBe(true);
  });

  it('school memory creates school, group, and link ops', () => {
    const result = parseLoreBookText({
      userId: 'test-user',
      text: FIXTURE_SCHOOL_MEMORY_TEXT,
    });
    expect(findMatchingOperations(result, { kind: 'suggest_add', domain: 'schools', nameMatch: /Whittier/i }).length).toBeGreaterThan(0);
    expect(findMatchingOperations(result, { kind: 'suggest_add', domain: 'groups', nameMatch: /Band/i }).length).toBeGreaterThan(0);
    expect(findMatchingOperations(result, { kind: 'link', relationType: 'best_friend' }).length).toBeGreaterThan(0);
  });

  it('family title preserves Tio Ralph full name', () => {
    const result = parseLoreBookText({
      userId: 'test-user',
      text: FIXTURE_FAMILY_HOUSEHOLD_TEXT,
    });
    expect(
      findMatchingOperations(result, { kind: 'suggest_add', domain: 'characters', nameMatch: /Tio Ralph/i }).length
    ).toBeGreaterThan(0);
    expect(findMatchingOperations(result, { kind: 'suggest_add', nameMatch: /^Tio$/i }).length).toBe(0);
  });

  it('worksite Denny\'s does not become employer organization', () => {
    const result = parseLoreBookText({
      userId: 'test-user',
      text: FIXTURE_WORKSITE_EMPLOYER_TEXT,
    });
    expect(
      findMatchingOperations(result, { kind: 'suggest_add', domain: 'organizations', nameMatch: /Denny/i }).length
    ).toBe(0);
    expect(
      findMatchingOperations(result, { kind: 'suggest_add', domain: 'locations', nameMatch: /Denny/i }).length
    ).toBeGreaterThan(0);
  });

  it('consumer apps do not become projects', () => {
    const result = parseLoreBookText({
      userId: 'test-user',
      text: FIXTURE_CONSUMER_TOOLS_TEXT,
    });
    for (const tool of ['Codex', 'Cursor', 'Claude Code']) {
      expect(
        findMatchingOperations(result, { kind: 'suggest_add', domain: 'projects', nameMatch: new RegExp(tool, 'i') })
          .length
      ).toBe(0);
    }
    expect(
      findMatchingOperations(result, { kind: 'suggest_add', domain: 'projects', nameMatch: /LoreBook/i }).length
    ).toBeGreaterThan(0);
  });

  it('operations include evidence bundles on suggest_add', () => {
    const result = parseLoreBookText({
      userId: 'test-user',
      text: FIXTURE_SCHOOL_MEMORY_TEXT,
    });
    const adds = result.operations.filter((o) => o.kind === 'suggest_add');
    expect(adds.length).toBeGreaterThan(0);
    for (const add of adds) {
      if (add.kind !== 'suggest_add') continue;
      expect(add.evidence.quote.length).toBeGreaterThan(0);
    }
  });

  it('gates match sensitivity rules for family and identity', () => {
    const family = parseLoreBookText({ userId: 'u', text: FIXTURE_FAMILY_HOUSEHOLD_TEXT });
    const leslie = findMatchingOperations(family, {
      kind: 'suggest_add',
      domain: 'characters',
      nameMatch: /Leslie/i,
    })[0];
    expect(leslie?.kind).toBe('suggest_add');
    if (leslie?.kind === 'suggest_add') expect(leslie.gate).toBe('review');
  });

  it('debug summary reports operation counts', () => {
    const result = parseLoreBookText({
      userId: 'test-user',
      text: FIXTURE_PROJECT_TRUE_POSITIVE_TEXT,
      includeDebug: true,
    });
    const summary = summarizeParseResult(result);
    expect(summary.operationCount).toBeGreaterThan(0);
    expect(summary.spanCount).toBeGreaterThan(0);
  });
});

describe('LoreBook Parse Engine — golden fixture pack', () => {
  for (const spec of LOREBOOK_PARSER_FIXTURE_PACK) {
    it(`${spec.id}`, () => {
      const result = runLoreBookParserFixture(spec);
      assertLoreBookParserFixture(spec, result);
    });
  }
});
