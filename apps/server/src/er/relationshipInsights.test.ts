import { describe, it, expect } from 'vitest';
import {
  generateFadeWarning,
  generateCoreStability,
  generateScopeConcentrationInsights,
  generateRelationshipInsights,
  sortInsightsByRelevance,
} from './relationshipInsights';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

describe('generateFadeWarning', () => {
  it('returns FADE_WARNING when phase is WEAK and recency >= 45 days', () => {
    const edge = {
      phase: 'WEAK',
      last_evidence_at: daysAgo(50),
      to_entity_id: 'ent-1',
      confidence: 0.4,
      evidence_source_ids: ['m1'],
      start_time: daysAgo(200),
      scope: 'work',
    };
    const out = generateFadeWarning(edge);
    expect(out).not.toBeNull();
    expect(out!.type).toBe('FADE_WARNING');
    expect(out!.entity_id).toBe('ent-1');
    expect(out!.scope).toBe('work');
    expect(out!.explanation).toContain('weakened');
    expect(out!.supporting_evidence.evidence_count).toBe(1);
    expect(out!.supporting_evidence.age_days).toBeGreaterThanOrEqual(0);
    expect(out!.supporting_evidence.last_seen).toBe(edge.last_evidence_at);
  });

  it('returns null when phase is WEAK but recency < 45 days', () => {
    const edge = {
      phase: 'WEAK',
      last_evidence_at: daysAgo(30),
      to_entity_id: 'ent-1',
      confidence: 0.4,
      scope: 'work',
    };
    expect(generateFadeWarning(edge)).toBeNull();
  });

  it('returns null when phase is not WEAK', () => {
    expect(
      generateFadeWarning({
        phase: 'ACTIVE',
        last_evidence_at: daysAgo(60),
        to_entity_id: 'ent-1',
        confidence: 0.5,
        scope: 'work',
      })
    ).toBeNull();
    expect(
      generateFadeWarning({
        phase: 'CORE',
        last_evidence_at: daysAgo(60),
        to_entity_id: 'ent-1',
        confidence: 0.9,
        scope: 'work',
      })
    ).toBeNull();
  });

  it('returns null when to_entity_id is missing', () => {
    const edge = {
      phase: 'WEAK',
      last_evidence_at: daysAgo(50),
      confidence: 0.4,
      scope: 'work',
    };
    expect(generateFadeWarning(edge)).toBeNull();
  });

  it('treats missing last_evidence_at as Infinity recency (produces insight)', () => {
    const edge = {
      phase: 'WEAK',
      to_entity_id: 'ent-1',
      confidence: 0.3,
      scope: 'family',
    };
    const out = generateFadeWarning(edge);
    expect(out).not.toBeNull();
    expect(out!.type).toBe('FADE_WARNING');
  });
});

describe('generateCoreStability', () => {
  it('returns CORE_STABILITY when phase is CORE and confidence >= 0.85', () => {
    const edge = {
      phase: 'CORE',
      to_entity_id: 'ent-2',
      confidence: 0.9,
      last_evidence_at: daysAgo(5),
      evidence_source_ids: ['m1', 'm2'],
      start_time: daysAgo(365),
      scope: 'family',
    };
    const out = generateCoreStability(edge);
    expect(out).not.toBeNull();
    expect(out!.type).toBe('CORE_STABILITY');
    expect(out!.entity_id).toBe('ent-2');
    expect(out!.explanation).toContain('central and stable');
    expect(out!.supporting_evidence.evidence_count).toBe(2);
  });

  it('returns null when phase is CORE but confidence < 0.85', () => {
    expect(
      generateCoreStability({
        phase: 'CORE',
        to_entity_id: 'ent-2',
        confidence: 0.8,
        scope: 'work',
      })
    ).toBeNull();
  });

  it('returns null when phase is not CORE', () => {
    expect(
      generateCoreStability({
        phase: 'ACTIVE',
        to_entity_id: 'ent-2',
        confidence: 0.9,
        scope: 'work',
      })
    ).toBeNull();
  });

  it('returns null when to_entity_id is missing', () => {
    expect(
      generateCoreStability({
        phase: 'CORE',
        confidence: 0.9,
        scope: 'work',
      })
    ).toBeNull();
  });
});

describe('generateScopeConcentrationInsights', () => {
  it('returns [] when fewer than 5 ACTIVE edges in scope', () => {
    const edges = [
      { scope: 'work', phase: 'ACTIVE' },
      { scope: 'work', phase: 'ACTIVE' },
      { scope: 'work', phase: 'ACTIVE' },
      { scope: 'work', phase: 'ACTIVE' },
    ];
    expect(generateScopeConcentrationInsights(edges, 'work')).toEqual([]);
  });

  it('returns one SCOPE_CONCENTRATION insight when >= 5 ACTIVE in scope', () => {
    const edges = [
      { scope: 'work', phase: 'ACTIVE' },
      { scope: 'work', phase: 'ACTIVE' },
      { scope: 'work', phase: 'ACTIVE' },
      { scope: 'work', phase: 'ACTIVE' },
      { scope: 'work', phase: 'ACTIVE' },
    ];
    const out = generateScopeConcentrationInsights(edges, 'work');
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('SCOPE_CONCENTRATION');
    expect(out[0].entity_id).toBe('scope:work');
    expect(out[0].confidence).toBe(0.7);
    expect(out[0].supporting_evidence.evidence_count).toBe(5);
    expect(out[0].supporting_evidence.age_days).toBe(0);
    expect(out[0].explanation).toContain('work');
  });

  it('ignores WEAK/CORE when counting ACTIVE for scope concentration', () => {
    const edges = [
      { scope: 'work', phase: 'ACTIVE' },
      { scope: 'work', phase: 'ACTIVE' },
      { scope: 'work', phase: 'ACTIVE' },
      { scope: 'work', phase: 'ACTIVE' },
      { scope: 'work', phase: 'WEAK' },
      { scope: 'work', phase: 'CORE' },
    ];
    const out = generateScopeConcentrationInsights(edges, 'work');
    expect(out).toHaveLength(1);
    expect(out[0].supporting_evidence.evidence_count).toBe(4);
  });
});

describe('generateRelationshipInsights', () => {
  it('returns empty array when no edges', () => {
    expect(generateRelationshipInsights([])).toEqual([]);
  });

  it('aggregates FADE, CORE, and SCOPE_CONCENTRATION and returns sorted', () => {
    const edges = [
      {
        phase: 'WEAK',
        last_evidence_at: daysAgo(50),
        to_entity_id: 'fade-1',
        confidence: 0.35,
        scope: 'work',
      },
      {
        phase: 'CORE',
        to_entity_id: 'core-1',
        confidence: 0.9,
        scope: 'family',
      },
      ...Array(5).fill({ scope: 'work', phase: 'ACTIVE' }),
    ];
    const out = generateRelationshipInsights(edges);
    const types = out.map((i) => i.type);
    expect(types).toContain('FADE_WARNING');
    expect(types).toContain('CORE_STABILITY');
    expect(types).toContain('SCOPE_CONCENTRATION');
    // FADE_WARNING before CORE_STABILITY before SCOPE_CONCENTRATION (type order)
    expect(types.indexOf('FADE_WARNING')).toBeLessThan(types.indexOf('CORE_STABILITY'));
    expect(types.indexOf('CORE_STABILITY')).toBeLessThan(types.indexOf('SCOPE_CONCENTRATION'));
  });
});

describe('sortInsightsByRelevance', () => {
  it('orders by type priority then confidence desc', () => {
    const insights = [
      { type: 'SCOPE_CONCENTRATION' as const, confidence: 0.9, entity_id: 's1', scope: 'work' as const, phase: 'ACTIVE' as const, explanation: 'x', supporting_evidence: { evidence_count: 5, age_days: 0 } },
      { type: 'FADE_WARNING' as const, confidence: 0.3, entity_id: 'e1', scope: 'work' as const, phase: 'WEAK' as const, explanation: 'x', supporting_evidence: { evidence_count: 1, age_days: 60 } },
      { type: 'CORE_STABILITY' as const, confidence: 0.85, entity_id: 'e2', scope: 'family' as const, phase: 'CORE' as const, explanation: 'x', supporting_evidence: { evidence_count: 2, age_days: 100 } },
    ];
    const sorted = sortInsightsByRelevance(insights);
    expect(sorted[0].type).toBe('FADE_WARNING');
    expect(sorted[1].type).toBe('CORE_STABILITY');
    expect(sorted[2].type).toBe('SCOPE_CONCENTRATION');
  });
});
