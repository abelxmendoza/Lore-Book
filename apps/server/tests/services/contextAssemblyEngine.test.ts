import { describe, expect, it } from 'vitest';

import {
  buildContextAssemblyPlan,
  evaluateContextCandidate,
} from '../../src/services/contextAssembly';

describe('Context Assembly Engine', () => {
  it('treats a career timeline as career-first, not as an unrestricted timeline', () => {
    const plan = buildContextAssemblyPlan({
      question: 'Build my career timeline.',
      intent: 'TIMELINE_QUERY',
    });

    expect(plan.primary).toBe('career');
    expect(plan.secondary).toEqual(expect.arrayContaining(['education', 'projects', 'skills']));
    expect(plan.excluded).toEqual(expect.arrayContaining(['relationships', 'family', 'music']));
    expect(plan.strictBoundary).toBe(true);
  });

  it('prunes relationship drift from career context', () => {
    const plan = buildContextAssemblyPlan({ question: 'What jobs have I had?', intent: 'CAREER_QUERY' });
    const verdict = evaluateContextCandidate({
      type: 'relationship',
      title: 'A difficult breakup',
      content: 'A relationship chapter with Morgan.',
    }, plan);

    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain('context_drift:relationships');
  });

  it('keeps career evidence and explicitly career-linked projects', () => {
    const plan = buildContextAssemblyPlan({ question: 'Build my career timeline.', intent: 'CAREER_QUERY' });

    expect(evaluateContextCandidate({
      type: 'event',
      title: 'Joined Vanguard Robotics',
      content: 'Started a new engineering job.',
    }, plan).accepted).toBe(true);

    expect(evaluateContextCandidate({
      type: 'project',
      title: 'MemoVault',
      content: 'Built a startup and shipped the first prototype.',
    }, plan).accepted).toBe(true);
  });

  it('does not treat every unrelated project or hobby skill as career evidence', () => {
    const plan = buildContextAssemblyPlan({ question: 'What is my career history?', intent: 'CAREER_QUERY' });

    expect(evaluateContextCandidate({
      type: 'project',
      title: 'Weekend card deck',
      content: 'A personal card collection project.',
    }, plan).accepted).toBe(false);

    expect(evaluateContextCandidate({
      type: 'skill',
      title: 'Tabletop strategy',
      content: 'A hobby skill.',
      metadata: { is_professional: false },
    }, plan).accepted).toBe(false);
  });

  it('allows professional skills through an explicit career link', () => {
    const plan = buildContextAssemblyPlan({ question: 'What is my career history?', intent: 'CAREER_QUERY' });
    const verdict = evaluateContextCandidate({
      type: 'skill',
      title: 'Robotics engineering',
      content: 'Professional engineering experience.',
      metadata: { is_professional: true },
    }, plan);

    expect(verdict.accepted).toBe(true);
    expect(verdict.memberships).toContain('career');
  });
});
