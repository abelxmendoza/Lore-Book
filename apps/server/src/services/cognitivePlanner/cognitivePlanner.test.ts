import { describe, expect, it } from 'vitest';

import { formatCognitivePlanBlock, planCognition } from './cognitivePlanner';

describe('planCognition — strategy selection', () => {
  it('routes current-focus questions to thread inspection, never search', () => {
    for (const q of [
      'What am I building?',
      'What have I been focused on lately?',
      'What am I working on right now?',
    ]) {
      const plan = planCognition(q);
      expect(plan.strategy).toBe('current_focus');
      expect(plan.reasoning).toBe('inspect');
      expect(plan.allowObservationSearch).toBe(false);
      expect(plan.retrieve).toContain('active_threads');
    }
  });

  it('routes person questions to the relationship timeline', () => {
    const plan = planCognition('What happened with Rina?');
    expect(plan.strategy).toBe('relationship');
    expect(plan.reasoning).toBe('narrate');
    expect(plan.retrieve).toContain('relationship_history');
  });

  it('routes explanation questions to cross-domain synthesis', () => {
    const plan = planCognition('Why did I stop going to shows?');
    expect(plan.strategy).toBe('why');
    expect(plan.reasoning).toBe('explain');
    expect(plan.expectedAnswer).toBe('explanation');
  });

  it('why beats emotional reflection for "why have I been depressed"', () => {
    const plan = planCognition('Why have I been depressed lately?');
    expect(plan.strategy).toBe('why');
    expect(plan.retrieve).toContain('emotional_context');
  });

  it('routes change questions to temporal comparison', () => {
    for (const q of ['How has my career changed?', 'What changed since last month?', 'Am I happier than before?']) {
      const plan = planCognition(q);
      expect(plan.strategy).toBe('compare');
      expect(plan.reasoning).toBe('contrast');
      expect(plan.expectedAnswer).toBe('comparison');
    }
  });

  it('routes pattern questions to reflection with invention forbidden', () => {
    const plan = planCognition('What patterns do you notice in my relationships?');
    expect(plan.strategy).toBe('reflect_patterns');
    expect(plan.allowObservationSearch).toBe(false);
    expect(plan.directive).toMatch(/never invent/i);
  });

  it('routes identity questions to durable knowledge', () => {
    const plan = planCognition('What kind of person am I?');
    expect(plan.strategy).toBe('identity');
    expect(plan.retrieve[0]).toBe('knowledge');
  });

  it('routes history questions to chapters and events', () => {
    const plan = planCognition('What happened last spring?');
    expect(plan.strategy).toBe('timeline');
    expect(plan.retrieve).toContain('chapters');
  });

  it('leaves ordinary chat on the general path', () => {
    const plan = planCognition('Good morning! Slept great.');
    expect(plan.strategy).toBe('general');
    expect(plan.allowObservationSearch).toBe(true);
  });
});

describe('planCognition — WMA intent integration', () => {
  it('treats the WMA intent as authoritative when phrasing is oblique', () => {
    // Phrasing none of the planner regexes catch — WMA classified it upstream.
    const plan = planCognition('gimme the rundown on us, me and her', {
      wmaIntent: 'RELATIONSHIP_QUERY',
    });
    expect(plan.strategy).toBe('relationship');
  });

  it('maps momentum/direction intents to current focus with a hard allowlist', () => {
    const plan = planCognition('where is everything heading', { wmaIntent: 'MOMENTUM_QUERY' });
    expect(plan.strategy).toBe('current_focus');
    expect(plan.allowObservationSearch).toBe(false);
    expect(plan.retrieve).toEqual(['active_threads', 'knowledge', 'goals']);
  });

  it('lets why/pattern shapes override the WMA intent', () => {
    // WMA sees a person mention; the cognitive shape is still a why-question.
    const plan = planCognition('Why did things fall apart with Rina?', {
      wmaIntent: 'PERSON_QUERY',
    });
    expect(plan.strategy).toBe('why');
  });

  it('golden questions route to their strategies', () => {
    expect(planCognition('What am I focused on lately?').strategy).toBe('current_focus');
    expect(
      planCognition('What happened with Rina?', { wmaIntent: 'PERSON_QUERY' }).strategy,
    ).toBe('relationship');
    expect(
      planCognition('What changed since last month?', {
        wmaIntent: 'TEMPORAL_COMPARISON_QUERY',
      }).strategy,
    ).toBe('compare');
  });
});

describe('formatCognitivePlanBlock', () => {
  it('renders strategy and directive for planned questions', () => {
    const block = formatCognitivePlanBlock(planCognition('What am I working on?'))!;
    expect(block).toContain('current_focus');
    expect(block).toContain('ACTIVE NARRATIVE THREADS');
  });

  it('stays silent for general chat', () => {
    expect(formatCognitivePlanBlock(planCognition('hey'))).toBeNull();
  });
});
