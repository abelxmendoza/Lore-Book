import { describe, expect, it } from 'vitest';

import {
  classifyMessageComplexity,
  shouldBypassMultiEventSplit,
  shouldUseCheapIngestion,
} from '../../src/services/ingestion/messageComplexityGate';
import { resolveDecoratorPlan } from '../../src/services/chat/decoratorRouting';
import { knowledgeTypeEngineService } from '../../src/services/knowledgeTypeEngineService';
import {
  runWithMessageCost,
  recordDbQuery,
  recordSkippedOperation,
  summarizeMessageCost,
} from '../../src/lib/messageCostTracker';
import { multiEventSplittingService } from '../../src/services/conversationCentered/multiEventSplittingService';

const FIXTURES = {
  simpleEvent: 'I went to the gym with Maya yesterday.',
  complexStory:
    "Back in 2019 I was working at Northwind, then after I left I met Maya through Jamie, although I don't remember whether that happened before or after the concert.",
  correction: 'Actually it was Jamie, not Maya, who introduced me.',
  relationship: 'I met Maya through Jamie at Vanguard Robotics.',
  temporalAmbiguity: "I don't remember whether that happened before or after the concert.",
  factualRecall: 'When did I work at Northwind?',
  crossBook: 'How is Maya connected to MemoVault and Jamie?',
  reflective: 'Looking back, how am I doing with all of this?',
  entityHeavy: 'Maya, Jamie, Taylor, and Alex were all at Northwind Depot with Marcus.',
  duplicateResend: 'I went to the gym with Maya yesterday.',
};

describe('messageComplexityGate', () => {
  it('classifies a simple one-event disclosure without an LLM', () => {
    const decision = classifyMessageComplexity(FIXTURES.simpleEvent);
    expect(decision.class).toBe('SIMPLE_EVENT');
    expect(decision.failUpward).toBe(false);
    expect(shouldBypassMultiEventSplit(decision)).toBe(true);
    expect(shouldUseCheapIngestion(decision)).toBe(true);
  });

  it('classifies a complex multi-event story as temporally complex or ambiguous', () => {
    const decision = classifyMessageComplexity(FIXTURES.complexStory);
    expect(['TEMPORALLY_COMPLEX', 'MULTI_EVENT', 'RELATIONSHIP_COMPLEX', 'AMBIGUOUS']).toContain(
      decision.class
    );
    expect(shouldBypassMultiEventSplit(decision)).toBe(false);
  });

  it('classifies corrections, relationship updates, and factual recall', () => {
    expect(classifyMessageComplexity(FIXTURES.correction).class).toBe('CORRECTION');
    expect(classifyMessageComplexity(FIXTURES.relationship).class).toBe('RELATIONSHIP_COMPLEX');
    expect(classifyMessageComplexity(FIXTURES.factualRecall).class).toBe('NO_LORE');
    expect(classifyMessageComplexity(FIXTURES.temporalAmbiguity).class).toBe('TEMPORALLY_COMPLEX');
  });

  it('fails upward on dense entity-heavy stories', () => {
    const decision = classifyMessageComplexity(FIXTURES.entityHeavy);
    expect(decision.class).toBe('AMBIGUOUS');
    expect(decision.failUpward).toBe(true);
  });
});

describe('decoratorRouting', () => {
  it('skips unused emotion and memory-suggestion LLMs on simple recall', () => {
    const plan = resolveDecoratorPlan(FIXTURES.factualRecall);
    expect(plan.shouldRun('emotional_state').run).toBe(false);
    expect(plan.shouldRun('transition_analysis').run).toBe(false);
    expect(plan.shouldRun('memory_suggestion').run).toBe(false);
    expect(plan.shouldRun('continuity').run).toBe(true);
  });

  it('keeps memory suggestion for corrections', () => {
    const plan = resolveDecoratorPlan(FIXTURES.correction);
    expect(plan.shouldRun('memory_suggestion').run).toBe(true);
  });

  it('allows interpretive decorators on reflective prompts', () => {
    const plan = resolveDecoratorPlan(FIXTURES.reflective);
    expect(plan.shouldRun('transition_analysis').run).toBe(true);
    expect(plan.shouldRun('emotional_state').run).toBe(true);
  });
});

describe('batch unit classification', () => {
  it('classifies many units in one pass without an LLM', () => {
    const types = knowledgeTypeEngineService.classifyBatch([
      'I went to the gym with Maya yesterday.',
      'I feel exhausted.',
      'When did I work at Northwind?',
    ]);
    expect(types).toEqual(['EXPERIENCE', 'FEELING', 'QUESTION']);
  });
});

describe('normalization / split gate', () => {
  it('does not LLM-split a simple one-event message', async () => {
    const result = await multiEventSplittingService.splitEntryIntoEvents(FIXTURES.simpleEvent);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].content).toBe(FIXTURES.simpleEvent);
  });
});

describe('turn compute budget', () => {
  it('records db queries and skipped operations', () => {
    const summary = runWithMessageCost({ label: 'chat' }, () => {
      recordDbQuery(4);
      recordSkippedOperation('memory_suggestion');
      return summarizeMessageCost();
    });
    expect(summary?.dbQueries).toBe(1);
    expect(summary?.retrievedRows).toBe(4);
    expect(summary?.skippedOperations).toContain('memory_suggestion');
  });
});

describe('hot-path compute budget fixtures', () => {
  it('charges simple messages far fewer decorator LLM slots than complex stories', () => {
    const simple = resolveDecoratorPlan(FIXTURES.simpleEvent);
    const complex = resolveDecoratorPlan(FIXTURES.complexStory);
    const llmDecorators = ['transition_analysis', 'emotional_state', 'memory_suggestion'] as const;
    const simpleLlm = llmDecorators.filter((name) => simple.shouldRun(name).run).length;
    const complexLlm = llmDecorators.filter((name) => complex.shouldRun(name).run).length;
    expect(simpleLlm).toBe(0);
    expect(complexLlm).toBeGreaterThan(simpleLlm);
  });
});
