import { describe, it, expect } from 'vitest';
import { planAnswer, formatAnswerPlanBlock } from './responsePlanner';
import type { CognitivePlan } from '../cognitivePlanner/cognitivePlanner';
import type { WorkingMemoryAssembly, WorkingMemoryItem } from '../chat/workingMemoryAssembler';
import type { ResponseScopePlan } from '../responseScope/responseScopeTypes';

function item(overrides: Partial<WorkingMemoryItem>): WorkingMemoryItem {
  return {
    id: overrides.id ?? 'item-1',
    type: overrides.type ?? 'episode',
    title: overrides.title ?? 'Untitled',
    content: overrides.content ?? '',
    source: 'test',
    confidence: 0.8,
    score: overrides.score ?? 50,
    reasons: overrides.reasons ?? [],
    ...overrides,
  };
}

function assembly(events: WorkingMemoryItem[]): WorkingMemoryAssembly {
  return {
    entities: [],
    episodes: [],
    events,
    projects: [],
    goals: [],
    skills: [],
    communities: [],
    relationships: [],
    preferences: [],
    claims: [],
    timeline: [],
    rejected: [],
  } as unknown as WorkingMemoryAssembly;
}

function cognitivePlan(overrides: Partial<CognitivePlan> = {}): CognitivePlan {
  return {
    strategy: 'general',
    retrieve: ['knowledge'],
    reasoning: 'retrieve',
    expectedAnswer: 'summary',
    allowObservationSearch: true,
    directive: '',
    ...overrides,
  };
}

function scopePlan(overrides: Partial<ResponseScopePlan> = {}): ResponseScopePlan {
  return {
    intent: 'general',
    contextPlan: { version: 'context-assembly-v1', primary: 'general' as never, secondary: [], excluded: [], ranked: [], reason: 'test', strictBoundary: false },
    responseMode: 'chat',
    scopeSource: 'message',
    allowedDomains: [],
    blockedDomains: ['romance'],
    primaryEntities: [],
    isCorrection: false,
    correctionNames: [],
    maxEvidenceItems: 20,
    maxCharactersReturned: 4000,
    includeProvenanceSummary: false,
    includeUncertainty: false,
    closedScope: false,
    ...overrides,
  };
}

describe('planAnswer', () => {
  it('picks the highest-scored item as the primary focus', () => {
    const plan = planAnswer({
      goal: null,
      cognitivePlan: cognitivePlan({ expectedAnswer: 'summary' }),
      auditedAssembly: assembly([
        item({ id: 'low', title: 'Minor note', score: 20 }),
        item({ id: 'high', title: 'The big project shipped', score: 80 }),
      ]),
      scopePlan: scopePlan(),
    });
    expect(plan?.primaryFocus).toContain('The big project shipped');
  });

  it('carries blocked domains and correction names into avoid', () => {
    const plan = planAnswer({
      goal: null,
      cognitivePlan: cognitivePlan(),
      auditedAssembly: assembly([item({ id: 'a', score: 40 })]),
      scopePlan: scopePlan({ isCorrection: true, correctionNames: ['Wren'] }),
    });
    expect(plan?.avoid.some((a) => a.includes('Wren'))).toBe(true);
    expect(plan?.avoid).toContain('romance');
  });

  it('returns null when there is nothing to answer from and no correction in play', () => {
    const plan = planAnswer({
      goal: null,
      cognitivePlan: cognitivePlan(),
      auditedAssembly: assembly([]),
      scopePlan: scopePlan(),
    });
    expect(plan).toBeNull();
  });

  it('formats a compact block with focus, references, and avoid list', () => {
    const plan = planAnswer({
      goal: null,
      cognitivePlan: cognitivePlan(),
      auditedAssembly: assembly([
        item({ id: 'a', title: 'A', score: 60 }),
        item({ id: 'b', title: 'B', score: 55 }),
      ]),
      scopePlan: scopePlan(),
    });
    const block = formatAnswerPlanBlock(plan!);
    expect(block).toMatch(/^Answer: /);
    expect(block).toContain('May reference:');
  });
});

describe('planAnswer — Reflection Generator (Blueprint 21 Phase 3)', () => {
  it('produces a synthesisNote when a name recurs across ≥2 distinct dates on a reflection question', () => {
    const plan = planAnswer({
      goal: null,
      cognitivePlan: cognitivePlan({ expectedAnswer: 'reflection', strategy: 'reflect_patterns' }),
      auditedAssembly: assembly([
        item({ id: 'a', title: 'Coffee with Kiley', date: '2024-01-01', score: 40 }),
        item({ id: 'b', title: "Kiley's birthday party", date: '2024-06-15', score: 45 }),
      ]),
      scopePlan: scopePlan(),
    });
    expect(plan?.synthesisNote).toContain('kiley');
    expect(plan?.synthesisNote).toContain('recurs across 2');
  });

  it('produces no synthesisNote for a single occurrence', () => {
    const plan = planAnswer({
      goal: null,
      cognitivePlan: cognitivePlan({ expectedAnswer: 'reflection' }),
      auditedAssembly: assembly([item({ id: 'a', title: 'Coffee with Kiley', date: '2024-01-01', score: 40 })]),
      scopePlan: scopePlan(),
    });
    expect(plan?.synthesisNote).toBeUndefined();
  });

  it('never produces a synthesisNote outside a reflection-shaped question, even with qualifying recurrence', () => {
    const plan = planAnswer({
      goal: null,
      cognitivePlan: cognitivePlan({ expectedAnswer: 'summary' }),
      auditedAssembly: assembly([
        item({ id: 'a', title: 'Coffee with Kiley', date: '2024-01-01', score: 40 }),
        item({ id: 'b', title: "Kiley's birthday party", date: '2024-06-15', score: 45 }),
      ]),
      scopePlan: scopePlan(),
    });
    expect(plan?.synthesisNote).toBeUndefined();
  });

  it('does not count same-date repeats from one retrieval cluster as recurrence', () => {
    const plan = planAnswer({
      goal: null,
      cognitivePlan: cognitivePlan({ expectedAnswer: 'reflection' }),
      auditedAssembly: assembly([
        item({ id: 'a', title: 'Coffee with Kiley', date: '2024-01-01', score: 40 }),
        item({ id: 'b', title: 'Lunch with Kiley', date: '2024-01-01', score: 38 }),
      ]),
      scopePlan: scopePlan(),
    });
    expect(plan?.synthesisNote).toBeUndefined();
  });
});

describe('formatAnswerPlanBlock — Human-Like Response Ordering (Blueprint 21 Phase 3)', () => {
  it('always appends the same response-ordering instruction for a minimal plan', () => {
    const plan = planAnswer({
      goal: null,
      cognitivePlan: cognitivePlan(),
      auditedAssembly: assembly([item({ id: 'a', score: 40 })]),
      scopePlan: scopePlan(),
    });
    const block = formatAnswerPlanBlock(plan!);
    expect(block).toContain('Order: (1) direct answer first');
    expect(block).toContain('Never open with a bulleted dump of retrieved facts.');
  });

  it('appends the identical ordering instruction for a fully-populated plan', () => {
    const plan = planAnswer({
      goal: null,
      cognitivePlan: cognitivePlan({ expectedAnswer: 'reflection' }),
      auditedAssembly: assembly([
        item({ id: 'a', title: 'Coffee with Kiley', date: '2024-01-01', score: 40 }),
        item({ id: 'b', title: "Kiley's birthday party", date: '2024-06-15', score: 45 }),
        item({ id: 'c', title: 'Other note', score: 20 }),
      ]),
      scopePlan: scopePlan({ isCorrection: true, correctionNames: ['Wren'] }),
    });
    const block = formatAnswerPlanBlock(plan!);
    expect(block).toContain('Order: (1) direct answer first');
  });
});
