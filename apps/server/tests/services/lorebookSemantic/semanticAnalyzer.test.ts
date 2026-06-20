import { describe, it, expect } from 'vitest';

import { parseLoreBookText } from '../../../src/services/lorebook/parser/loreBookParseEngine';
import {
  FIXTURE_CONSUMER_TOOLS_TEXT,
  FIXTURE_FAMILY_HOUSEHOLD_TEXT,
  FIXTURE_PERSON_VS_PROJECT_TEXT,
  FIXTURE_SCHOOL_MEMORY_TEXT,
} from '../../../src/services/lorebook/parser/fixtures/loreBookParserFixtures';
import {
  analyzeSemantics,
  parseResultToSemanticAnalysis,
} from '../../../src/services/lorebook/semantic/semanticAnalyzerService';

describe('LoreBook Semantic Analyzer — Phase 1.5 contract', () => {
  it('returns the full SemanticAnalysis shape with future layers empty (not faked)', () => {
    const analysis = analyzeSemantics({
      userId: 'u',
      text: FIXTURE_SCHOOL_MEMORY_TEXT,
    });

    // Populated layers
    expect(Array.isArray(analysis.entities)).toBe(true);
    expect(Array.isArray(analysis.relationships)).toBe(true);
    expect(Array.isArray(analysis.events)).toBe(true);
    expect(Array.isArray(analysis.crossBook)).toBe(true);
    expect(Array.isArray(analysis.reviewItems)).toBe(true);
    expect(Array.isArray(analysis.provenance)).toBe(true);

    // Declared-but-not-yet-populated layers are present and empty.
    expect(analysis.stances).toEqual([]);
    expect(analysis.temporal).toEqual([]);
    expect(analysis.contradictions).toEqual([]);

    expect(analysis.userId).toBe('u');
    expect(analysis.confidence).toBeGreaterThanOrEqual(0);
    expect(analysis.confidence).toBeLessThanOrEqual(1);
  });

  it('projects parser operations into grounded entities, relationships, and provenance', () => {
    const analysis = analyzeSemantics({ userId: 'u', text: FIXTURE_SCHOOL_MEMORY_TEXT });

    expect(analysis.entities.length).toBeGreaterThan(0);
    expect(analysis.relationships.length).toBeGreaterThan(0);
    expect(analysis.provenance.length).toBeGreaterThan(0);

    // New entities (no canon) resolve as `new` with explainable criteria.
    const newEntity = analysis.entities.find((e) => e.resolution === 'new');
    expect(newEntity).toBeDefined();
    expect(newEntity!.criteria.length).toBeGreaterThan(0);
  });

  it('every reviewItem carries a gate — the single field the MRQ write gate routes on', () => {
    const analysis = analyzeSemantics({ userId: 'u', text: FIXTURE_FAMILY_HOUSEHOLD_TEXT });
    expect(analysis.reviewItems.length).toBeGreaterThan(0);
    for (const item of analysis.reviewItems) {
      expect(['auto', 'suggest', 'review', 'block']).toContain(item.gate);
      expect(item.operation).toBeDefined();
      expect(item.reason.length).toBeGreaterThan(0);
    }
  });

  it('dangling relationships are forced to review and flagged unresolved', () => {
    const analysis = analyzeSemantics({ userId: 'u', text: FIXTURE_SCHOOL_MEMORY_TEXT });
    const dangling = analysis.relationships.filter((r) => !r.bothEndpointsResolved);
    expect(dangling.length).toBeGreaterThan(0);
    for (const edge of dangling) {
      const item = analysis.reviewItems.find(
        (ri) => ri.operation.kind === 'link' && ri.reason === 'dangling_endpoint'
      );
      expect(item?.gate).toBe('review');
    }
  });

  it('cross-book guard surfaces as a crossBook hint, not a competing entity', () => {
    const analysis = analyzeSemantics({
      userId: 'u',
      text: FIXTURE_PERSON_VS_PROJECT_TEXT,
      canonSeed: { characters: [{ name: 'Hell Fairy' }] },
    });
    // Hell Fairy must not appear as a new project entity.
    const projectEntity = analysis.entities.find(
      (e) => e.domain === 'projects' && /hell fairy/i.test(e.name)
    );
    expect(projectEntity).toBeUndefined();
  });

  it('consumer tools are not promoted to entities, but a real project is', () => {
    const analysis = analyzeSemantics({ userId: 'u', text: FIXTURE_CONSUMER_TOOLS_TEXT });
    for (const tool of ['Codex', 'Cursor', 'Claude Code']) {
      const promoted = analysis.entities.find(
        (e) => e.domain === 'projects' && new RegExp(tool, 'i').test(e.name)
      );
      expect(promoted).toBeUndefined();
    }
    const lorebook = analysis.entities.find(
      (e) => e.domain === 'projects' && /lorebook/i.test(e.name)
    );
    expect(lorebook).toBeDefined();
  });

  it('pure projection is deterministic and does not mutate the parse result', () => {
    const result = parseLoreBookText({ userId: 'u', text: FIXTURE_SCHOOL_MEMORY_TEXT });
    const snapshot = JSON.stringify(result);
    const a = parseResultToSemanticAnalysis(result);
    const b = parseResultToSemanticAnalysis(result);
    expect(JSON.stringify(result)).toBe(snapshot); // no mutation
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // deterministic
  });

  it('raw parser output is omitted unless explicitly requested', () => {
    const withoutRaw = analyzeSemantics({ userId: 'u', text: FIXTURE_SCHOOL_MEMORY_TEXT });
    expect(withoutRaw.raw).toBeUndefined();
    const withRaw = analyzeSemantics({
      userId: 'u',
      text: FIXTURE_SCHOOL_MEMORY_TEXT,
      includeRaw: true,
    });
    expect(withRaw.raw).toBeDefined();
    expect(withRaw.raw!.operations).toBeDefined();
  });
});
