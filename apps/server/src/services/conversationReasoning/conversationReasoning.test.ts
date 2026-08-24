/**
 * Blueprint 21 Phases 1-2 — reasoning-core scenario gate.
 * Usage: npm run test:reasoning-core-quality (root) or vitest run here directly.
 */
import { describe, it, expect } from 'vitest';
import { resolveConversationGoal } from './goalTracker';
import { auditWorkingMemoryAssembly } from './retrievalAuditor';
import { resolveDiscourseReferents } from './discourseReasoner';
import { evaluateConversationTierGate } from './memoryTierGate';
import { detectConversationMilestone } from './milestoneDetector';
import {
  REASONING_CORE_SCENARIOS,
  GOAL_PERSISTENCE_FIXTURES,
  type GoalPersistenceScenario,
  type RetrievalAuditScenario,
  type DiscourseResolutionScenario,
  type MemoryTierGateScenario,
  type MilestoneDetectionScenario,
} from './fixtures/scenarios';
import type { WorkingMemoryAssembly, WorkingMemoryItem } from '../chat/workingMemoryAssembler';
import type { ResponseScopePlan } from '../responseScope/responseScopeTypes';

function baseScopePlan(overrides: Partial<ResponseScopePlan> = {}): ResponseScopePlan {
  return {
    intent: 'general',
    contextPlan: { version: 'context-assembly-v1', primary: 'general' as never, secondary: [], excluded: [], ranked: [], reason: 'test', strictBoundary: false },
    responseMode: 'chat',
    scopeSource: 'message',
    allowedDomains: [],
    blockedDomains: [],
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

function buildAssembly(items: RetrievalAuditScenario['items']): WorkingMemoryAssembly {
  const events: WorkingMemoryItem[] = items.map((i) => ({
    id: i.id,
    type: i.type,
    title: i.title,
    content: i.content,
    source: 'fixture',
    confidence: 0.8,
    score: i.score ?? 50,
    reasons: [],
  }));
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
    budget: { maxItems: 20, selected: events.length, rejected: 0 },
  } as unknown as WorkingMemoryAssembly;
}

function runGoal(scenario: GoalPersistenceScenario) {
  return resolveConversationGoal({
    message: scenario.message,
    current: scenario.priorGoal ? GOAL_PERSISTENCE_FIXTURES[scenario.priorGoal] : null,
    isCorrection: scenario.isCorrection ?? false,
    isRetry: scenario.isRetry ?? false,
  });
}

function runAudit(scenario: RetrievalAuditScenario) {
  return auditWorkingMemoryAssembly(
    buildAssembly(scenario.items),
    scenario.message,
    baseScopePlan(scenario.scopePlanOverrides),
  );
}

function runDiscourse(scenario: DiscourseResolutionScenario) {
  return resolveDiscourseReferents({ message: scenario.message, history: [], activeContext: scenario.activeContext });
}

function runTierGate(scenario: MemoryTierGateScenario) {
  return evaluateConversationTierGate({
    message: scenario.message,
    activeContext: scenario.activeContext,
    conversationHistory: scenario.conversationHistory,
  });
}

function runMilestone(scenario: MilestoneDetectionScenario) {
  return detectConversationMilestone(scenario.message);
}

describe('reasoning core scenario corpus', () => {
  it('has at least 30 scenarios', () => {
    expect(REASONING_CORE_SCENARIOS.length).toBeGreaterThanOrEqual(30);
  });

  for (const scenario of REASONING_CORE_SCENARIOS) {
    it(`passes ${scenario.id}`, () => {
      if (scenario.kind === 'goal_persistence') {
        const r = runGoal(scenario);
        expect(r.next.goal, scenario.title).toBe(scenario.expectedGoal);
        expect(r.changed, scenario.title).toBe(scenario.expectedChanged);
      } else if (scenario.kind === 'retrieval_audit') {
        const r = runAudit(scenario);
        const keptIds = r.assembly.events.map((e) => e.id);
        for (const id of scenario.expectKeptIds) {
          expect(keptIds, scenario.title).toContain(id);
        }
        for (const id of scenario.expectDiscardedIds) {
          expect(keptIds, scenario.title).not.toContain(id);
          expect(
            r.assembly.rejected.some((rej) => rej.id === id),
            `${scenario.title}: expected ${id} in rejected list`,
          ).toBe(true);
        }
      } else if (scenario.kind === 'discourse_resolution') {
        const r = runDiscourse(scenario);
        expect(r.kind, scenario.title).toBe(scenario.expectedKind);
        if (scenario.expectedEntityName && r.kind === 'entity') {
          expect(r.entityName, scenario.title).toBe(scenario.expectedEntityName);
        }
        if (scenario.expectedTopicContains && r.kind === 'exchange') {
          expect(r.topicSummary, scenario.title).toContain(scenario.expectedTopicContains);
        }
      } else if (scenario.kind === 'memory_tier_gate') {
        const r = runTierGate(scenario);
        expect(r.shortCircuit, `${scenario.title}: ${r.reason}`).toBe(scenario.expectShortCircuit);
      } else {
        const r = runMilestone(scenario);
        expect(r?.type ?? null, scenario.title).toBe(scenario.expectedType);
      }
    });
  }
});

describe('aggregate gates', () => {
  it('goal_stability_rate is 1.0 across all expectedChanged:false scenarios', () => {
    const stableScenarios = REASONING_CORE_SCENARIOS.filter(
      (s): s is GoalPersistenceScenario => s.kind === 'goal_persistence' && !s.expectedChanged,
    );
    const held = stableScenarios.filter((s) => runGoal(s).changed === false);
    expect(held.length / stableScenarios.length).toBe(1.0);
  });

  it('zero false-negative discards on must-survive retrieval scenarios', () => {
    const surviveScenarios = REASONING_CORE_SCENARIOS.filter(
      (s): s is RetrievalAuditScenario => s.kind === 'retrieval_audit' && s.expectKeptIds.length > 0,
    );
    for (const scenario of surviveScenarios) {
      const r = runAudit(scenario);
      const keptIds = new Set(r.assembly.events.map((e) => e.id));
      for (const id of scenario.expectKeptIds) {
        expect(keptIds.has(id), `${scenario.title}: ${id} was wrongly discarded`).toBe(true);
      }
    }
  });

  it('tier_gate_false_positive_rate is 0 across all expectShortCircuit:false scenarios', () => {
    const mustNotFire = REASONING_CORE_SCENARIOS.filter(
      (s): s is MemoryTierGateScenario => s.kind === 'memory_tier_gate' && !s.expectShortCircuit,
    );
    const falsePositives = mustNotFire.filter((s) => runTierGate(s).shortCircuit === true);
    expect(falsePositives.map((s) => s.id)).toEqual([]);
  });

  it('milestone_precision is 1.0 across all life-event/non-milestone-shaped scenarios', () => {
    const mustNotFire = REASONING_CORE_SCENARIOS.filter(
      (s): s is MilestoneDetectionScenario => s.kind === 'milestone_detection' && s.expectedType === null,
    );
    const falsePositives = mustNotFire.filter((s) => runMilestone(s) !== null);
    expect(falsePositives.map((s) => s.id)).toEqual([]);
  });
});
