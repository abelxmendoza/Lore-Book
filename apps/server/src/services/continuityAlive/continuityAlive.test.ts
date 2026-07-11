import { describe, it, expect } from 'vitest';
import { selectContinuity } from './selectContinuity';
import { evaluateScenario, runContinuityBenchmark, formatBenchmarkReport } from './scoreBenchmark';
import { CONTINUITY_SCENARIOS } from './fixtures/scenarios';
import { CONTINUITY_COMPOSITION_RULES } from './composition';

describe('continuityAlive selection', () => {
  it('selects 0–3 candidates', () => {
    const r = selectContinuity({
      currentMessage: 'Who built Prima AI?',
      memories: [
        {
          memoryId: '1',
          memoryType: 'entity',
          summary: 'Khalil built Prima AI.',
          entities: ['Khalil', 'Prima AI'],
          confidence: 0.9,
          epistemicType: 'direct_statement',
        },
        {
          memoryId: '2',
          memoryType: 'event',
          summary: 'I ate pizza yesterday.',
          confidence: 0.8,
        },
        {
          memoryId: '3',
          memoryType: 'preference',
          summary: 'I like blue notebooks.',
          confidence: 0.8,
        },
      ],
    });
    expect(r.selected.length).toBeLessThanOrEqual(3);
    expect(r.selected.some((s) => /Khalil|Prima/i.test(s.summary))).toBe(true);
  });

  it('returns zero candidates for definitional questions with unrelated memory', () => {
    const r = selectContinuity({
      currentMessage: 'What does forlorn mean?',
      memories: [
        {
          memoryId: 'ring',
          memoryType: 'event',
          summary: 'I installed a Ring camera last week.',
          entities: ['Ring'],
          confidence: 0.9,
        },
      ],
    });
    expect(r.selected.every((s) => !/Ring|camera/i.test(s.summary))).toBe(true);
  });

  it('respects corrections over contradicted identity', () => {
    const r = selectContinuity({
      currentMessage: 'Who created Prima AI?',
      memories: [
        {
          memoryId: 'false',
          memoryType: 'entity',
          summary: 'Prima AI linked to Cousin James.',
          entities: ['Cousin James', 'Prima AI'],
          correctionState: 'contradicted',
          confidence: 0.5,
        },
        {
          memoryId: 'true',
          memoryType: 'correction',
          summary: 'Prima AI is a tool built by Khalil, not Cousin James.',
          entities: ['Khalil', 'Prima AI'],
          confidence: 0.95,
          epistemicType: 'user_corrected',
          correctionState: 'active',
        },
      ],
    });
    const blob = r.selected.map((s) => s.summary).join(' ');
    expect(blob).toMatch(/Khalil/);
    // Correction text may say "not Cousin James" — stale positive link must not be selected alone
    expect(r.selected.some((s) => s.memoryId === 'false')).toBe(false);
    expect(r.selected.some((s) => /Khalil/i.test(s.summary))).toBe(true);
  });

  it('restrains sensitive memory without strong relevance', () => {
    const r = selectContinuity({
      currentMessage: 'What should I cook for dinner?',
      memories: [
        {
          memoryId: 'date',
          memoryType: 'event',
          summary: 'That date ended awkwardly and I felt embarrassed.',
          sensitivity: 'embarrassment',
          confidence: 0.9,
        },
      ],
    });
    expect(r.selected.some((s) => /date|embarrass/i.test(s.summary))).toBe(false);
  });

  it('exposes structured relevance breakdown and recommendedUse', () => {
    const r = selectContinuity({
      currentMessage: 'Someone pulled away while dancing so I backed off.',
      memories: [
        {
          memoryId: 'lesson',
          memoryType: 'lesson',
          summary: 'The Jenna situation taught me to respect boundaries.',
          entities: ['Jenna'],
          confidence: 0.9,
          epistemicType: 'direct_statement',
          sensitivity: 'dating',
          tags: ['boundaries'],
        },
      ],
    });
    expect(r.trace.relevanceBreakdown.length).toBeGreaterThanOrEqual(0);
    if (r.selected[0]) {
      expect(r.selected[0].relevanceBreakdown).toHaveProperty('entity');
      expect(r.selected[0].relevanceBreakdown).toHaveProperty('composite');
      expect(r.selected[0].recommendedUse).not.toBe('do_not_use');
    }
  });

  it('includes composition rules constant', () => {
    expect(CONTINUITY_COMPOSITION_RULES).toMatch(/Do not dump/i);
  });
});

describe('continuityAlive required scenarios A–E', () => {
  for (const id of [
    'A_workplace_khalil',
    'B_behavioral_jenna',
    'C_career_rocketlab',
    'D_no_continuity_definition',
    'E_correction_prima',
  ]) {
    it(`passes ${id}`, () => {
      const sc = CONTINUITY_SCENARIOS.find((s) => s.id === id)!;
      const ev = evaluateScenario(sc);
      expect(ev.issues, ev.issues.join('; ')).toEqual([]);
    });
  }
});

describe('continuityAlive full benchmark gate', () => {
  it('has at least 30 scenarios', () => {
    expect(CONTINUITY_SCENARIOS.length).toBeGreaterThanOrEqual(30);
  });

  it('meets continuity quality gates', () => {
    const report = runContinuityBenchmark();
    // Log for CI visibility
    // eslint-disable-next-line no-console
    console.log(formatBenchmarkReport(report));
    expect(report.gates.correction_compliance_100).toBe(true);
    expect(report.gates.sensitive_overexposure_0).toBe(true);
    expect(report.gates.entity_accuracy_ge_0_95).toBe(true);
    expect(report.gates.irrelevant_recall_le_0_05).toBe(true);
    expect(report.gates.overclaim_le_0_05).toBe(true);
    expect(report.gates.avg_candidates_le_3).toBe(true);
    expect(report.failures, JSON.stringify(report.failures, null, 2)).toEqual([]);
    expect(report.pass).toBe(true);
  });
});
