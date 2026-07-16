/**
 * Relationship Cognition Engine regression tests.
 *
 * All lore is FICTIONAL (Vanguard Robotics demo world) — never real people.
 * The five hard cases from the spec:
 *  1. busy month + silence → no decay to "no interest"
 *  2. "I'm over X" → trajectory updates immediately
 *  3. one hookup → one-night stand until evidence evolves
 *  4. post-breakup rumination → attachment stays elevated after the ending
 *  5. new relationship + processing an ex coexist
 */
import { describe, it, expect } from 'vitest';

import {
  answerRelationshipQuestion,
  detectRelationshipQuestion,
  extractQuestionPerson,
} from '../../../src/services/relationships/relationshipReasoner';
import {
  resolveAllSnapshots,
  resolveRelationshipSnapshot,
} from '../../../src/services/relationships/relationshipStateResolver';
import { decayMultiplier, resolveWorkload } from '../../../src/services/relationships/relationshipDecay';
import type {
  RelationshipCognitionContext,
  RelationshipEvidence,
  RelationshipPerson,
} from '../../../src/services/relationships/relationshipCognitionTypes';

const NOW = '2026-03-15T20:00:00.000Z';

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
}

function person(personId: string, name: string, types: string[] = []): RelationshipPerson {
  return { personId, name, storedRelationshipTypes: types };
}

let evidenceId = 0;
function ev(
  personId: string,
  text: string,
  at?: string,
  source: RelationshipEvidence['source'] = 'direct_statement',
): RelationshipEvidence {
  return { id: `t-${(evidenceId += 1)}`, personId, text, at, source };
}

function ctx(overrides: Partial<RelationshipCognitionContext>): RelationshipCognitionContext {
  return {
    userId: 'user-test',
    people: [],
    evidence: [],
    recencyByEntity: new Map(),
    workload: { busyWithWork: false, busyWithProject: false, globalActivityDrop: false, reasons: [] },
    now: NOW,
    ...overrides,
  };
}

describe('question detection', () => {
  it('routes relationship questions and ignores ordinary chat', () => {
    expect(detectRelationshipQuestion('Who am I interested in?')).toBe('romantic_interest');
    expect(detectRelationshipQuestion('am I over Mena?')).toBe('relationship_state');
    expect(detectRelationshipQuestion("what's my situation with Wren")).toBe('relationship_state');
    expect(detectRelationshipQuestion("who's been on my mind lately?")).toBe('thinking_about');
    expect(detectRelationshipQuestion('I went dancing with Wren last night')).toBeNull();
    expect(detectRelationshipQuestion('who matters most to me?')).toBeNull();
  });

  it('matches the asked-about person against the cast', () => {
    const people = [person('a', 'Wren'), person('b', 'Mena')];
    expect(extractQuestionPerson('am I over Mena?', people)?.personId).toBe('b');
    expect(extractQuestionPerson('how do I feel about wren', people)?.personId).toBe('a');
  });
});

describe('case 1: busy month, no mentions — silence is not evidence', () => {
  it('freezes decay and keeps interest instead of dropping to none', () => {
    const workload = resolveWorkload({
      work: {
        currentRole: { title: 'QA Technician', status: 'current', confidence: 0.9, evidenceIds: [] },
        organization: { name: 'Vanguard Robotics' },
        managers: [], leads: [], coworkers: [], tools: [], currentTasks: [], blockers: [],
        tenure: { phrase: 'second month', precision: 'month', confidence: 0.8 },
        correctionsApplied: [], warnings: [],
      },
      now: NOW,
    });
    expect(workload.busyWithWork).toBe(true);

    const decay = decayMultiplier({ daysSinceEvidence: 50, workload, hasCompetingEvidence: true });
    expect(decay.frozen).toBe(true);
    expect(decay.multiplier).toBe(1);

    const context = ctx({
      people: [person('wren', 'Wren')],
      evidence: [
        ev('wren', 'I really like Wren, butterflies every time we talk', daysAgo(50)),
        ev('wren', 'hope Wren is around next weekend', daysAgo(48)),
      ],
      workload,
    });
    const snapshot = resolveRelationshipSnapshot(context.people[0], context, {
      hasCompetingEvidence: true,
    });
    expect(snapshot.interest.score).toBeGreaterThanOrEqual(40);
    expect(snapshot.trajectory.direction).toBe('uncertain');
    expect(snapshot.trajectory.direction).not.toBe('fading');
    expect(snapshot.romanticStage.stage).not.toBe('no_interest');
  });

  it('pure silence without workload only drifts mildly, never to zero', () => {
    const decay = decayMultiplier({
      daysSinceEvidence: 120,
      workload: { busyWithWork: false, busyWithProject: false, globalActivityDrop: false, reasons: [] },
      hasCompetingEvidence: false,
    });
    expect(decay.multiplier).toBeGreaterThanOrEqual(0.85);
  });
});

describe('case 2: "I\'m over X" — corrections override inference', () => {
  it('updates trajectory to ended and stage to moving on immediately', () => {
    const context = ctx({
      people: [person('mena', 'Mena', ['ex_girlfriend'])],
      evidence: [
        ev('mena', 'still missing Mena, heartbroken about how it ended', daysAgo(60)),
        ev('mena', 'we broke up in the winter', daysAgo(90)),
        ev('mena', "I'm over Mena, I've moved on", daysAgo(2)),
      ],
    });
    const snapshot = resolveRelationshipSnapshot(context.people[0], context);
    expect(snapshot.romanticStage.stage).toBe('moving_on');
    expect(snapshot.trajectory.direction).toBe('ended');
    expect(snapshot.trajectory.probability).toBeGreaterThanOrEqual(0.8);
    expect(snapshot.trajectory.reasons[0]).toMatch(/corrections override/i);
  });
});

describe('case 3: one hookup — one-night stand until evidence evolves', () => {
  it('classifies a single encounter without romance as one_night_stand', () => {
    const context = ctx({
      people: [person('kira', 'Kira')],
      evidence: [ev('kira', 'hooked up with Kira after the show', daysAgo(10), 'shared_experience')],
    });
    const snapshot = resolveRelationshipSnapshot(context.people[0], context);
    expect(snapshot.romanticStage.stage).toBe('one_night_stand');
    expect(snapshot.sexualRelationship.state).toBe('sexual_encounter');
  });

  it('evolves when later evidence shows an ongoing thing', () => {
    const context = ctx({
      people: [person('kira', 'Kira')],
      evidence: [
        ev('kira', 'hooked up with Kira after the show', daysAgo(30), 'shared_experience'),
        ev('kira', 'we hooked up again and talked all night, I care about her', daysAgo(5), 'shared_experience'),
      ],
    });
    const snapshot = resolveRelationshipSnapshot(context.people[0], context);
    expect(snapshot.romanticStage.stage).not.toBe('one_night_stand');
    expect(['situationship', 'friends_with_benefits']).toContain(snapshot.romanticStage.stage);
    expect(snapshot.sexualRelationship.state).toBe('ongoing_sexual_relationship');
  });

  it('NEVER infers a sexual relationship without explicit evidence', () => {
    const context = ctx({
      people: [person('juno', 'Juno')],
      evidence: [
        ev('juno', 'huge crush on Juno, so cute, really into her', daysAgo(3)),
        ev('juno', 'hope Juno comes to the next show', daysAgo(2)),
      ],
    });
    const snapshot = resolveRelationshipSnapshot(context.people[0], context);
    expect(snapshot.sexualRelationship.state).toBe('unknown');
    expect(snapshot.sexualRelationship.evidenceExcerpts).toHaveLength(0);
  });
});

describe('case 4: post-breakup rumination — attachment outlives the ending', () => {
  it('keeps emotional attachment elevated while the stage is ex', () => {
    const context = ctx({
      people: [person('mena', 'Mena', ['ex_girlfriend'])],
      evidence: [
        ev('mena', 'we broke up two months ago', daysAgo(60)),
        ev('mena', 'still think about Mena all the time', daysAgo(12)),
        ev('mena', 'that song crossed my mind and reminded me of her, missing Mena', daysAgo(6)),
        ev('mena', 'dreamt about Mena again', daysAgo(2)),
      ],
    });
    const snapshot = resolveRelationshipSnapshot(context.people[0], context);
    expect(['ex', 'rekindling']).toContain(snapshot.romanticStage.stage);
    expect(snapshot.emotionalAttachment.score).toBeGreaterThanOrEqual(0.5);
    // Thinking about, more than talking about.
    expect(snapshot.attention.thinkingScore).toBeGreaterThan(snapshot.attention.talkingScore);
  });
});

describe('case 5: competing relationships coexist', () => {
  it('supports processing an ex while a new relationship grows', () => {
    const context = ctx({
      people: [person('mena', 'Mena', ['ex_girlfriend']), person('wren', 'Wren')],
      evidence: [
        // Ex: attachment lingering
        ev('mena', 'we broke up last winter', daysAgo(120)),
        ev('mena', 'still think about Mena sometimes, miss her', daysAgo(15)),
        // New: fresh momentum
        ev('wren', 'went on a date with Wren, we kissed at the end', daysAgo(8), 'shared_experience'),
        ev('wren', 'really into Wren, butterflies, hope we go out again soon', daysAgo(3)),
      ],
    });
    const snapshots = resolveAllSnapshots(context);
    const mena = snapshots.find((s) => s.personName === 'Mena')!;
    const wren = snapshots.find((s) => s.personName === 'Wren')!;

    expect(wren.interest.score).toBeGreaterThanOrEqual(40);
    expect(['growing', 'stable']).toContain(wren.trajectory.direction);
    expect(mena.emotionalAttachment.score).toBeGreaterThanOrEqual(0.3);

    const answer = answerRelationshipQuestion('romantic_interest', context);
    expect(answer).not.toBeNull();
    expect(answer!.content).toContain('Wren');
    expect(answer!.content).toContain('Mena');
    expect(answer!.content).toMatch(/Based on recent conversations and the broader history/);
    expect(answer!.content).toMatch(/several things can be true at once/i);
  });
});

describe('relationship_state composition', () => {
  it('narrates attraction vs attachment divergence with hedging', () => {
    const context = ctx({
      people: [person('mena', 'Mena', ['ex_girlfriend'])],
      evidence: [
        ev('mena', 'we broke up months ago', daysAgo(100)),
        ev('mena', 'still think about Mena constantly, miss her so much', daysAgo(4)),
        ev('mena', 'not really interested in her romantically anymore', daysAgo(4)),
      ],
    });
    const answer = answerRelationshipQuestion('relationship_state', context, {
      message: 'am I over Mena?',
    });
    expect(answer).not.toBeNull();
    expect(answer!.content).toMatch(/Based on recent conversations/);
    expect(answer!.content).toMatch(/your word overrides/i);
    expect(answer!.confidence).toBeLessThanOrEqual(0.8);
  });

  it('returns null for empty graphs instead of guessing', () => {
    expect(answerRelationshipQuestion('romantic_interest', ctx({}))).toBeNull();
  });
});
