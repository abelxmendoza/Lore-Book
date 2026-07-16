/**
 * Narrative Cognition Layer regression tests.
 *
 * All lore here is FICTIONAL (demo cast around Vanguard Robotics) — never
 * real people, orgs, or places from any user's data.
 */
import { describe, it, expect } from 'vitest';

import {
  detectCognitionQuestion,
  answerCognitionQuestion,
  detectRecentChanges,
} from '../../../src/services/narrative/narrativeReasoner';
import { buildSalienceInputs } from '../../../src/services/narrative/relationshipSalience';
import {
  computePersonSalience,
  rankMostImportant,
} from '../../../src/services/narrative/salienceEngine';
import { resolveActiveArcs } from '../../../src/services/narrative/activeArcResolver';
import { resolveCurrentEra } from '../../../src/services/narrative/lifeEraResolver';
import { scoreEventImportance } from '../../../src/services/narrative/importanceScorer';
import { assembleStories, latestStory } from '../../../src/services/narrative/storyImportance';
import type { AnchorBuildContext, EntityGravityInput } from '../../../src/services/narrative/narrativeAnchorTypes';
import type { NarrativeCognitionContext } from '../../../src/services/narrative/narrativeCognitionTypes';
import type { WorkContext } from '../../../src/services/work/workContextTypes';

const NOW = '2026-03-15T20:00:00.000Z';

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
}

function person(id: string, name: string, overrides: Partial<EntityGravityInput> = {}): EntityGravityInput {
  return {
    entityId: id,
    entityType: 'character',
    name,
    mentionCount: 2,
    threadCount: 1,
    daysMentioned: 1,
    emotionalWeight: 0.3,
    eventParticipation: 0.1,
    relationshipStrength: 0.3,
    communityMembership: 0,
    narrativeImportance: 0.3,
    roles: [],
    facts: [],
    ...overrides,
  };
}

function place(id: string, name: string): EntityGravityInput {
  return {
    entityId: id,
    entityType: 'location',
    name,
    mentionCount: 2,
    threadCount: 0,
    daysMentioned: 1,
    emotionalWeight: 0.2,
    eventParticipation: 0.2,
    relationshipStrength: 0,
    communityMembership: 0,
    narrativeImportance: 0.3,
  };
}

/** Fictional demo world: new QA job at Vanguard Robotics, side project, ex, scene. */
function fixtureGraph(): AnchorBuildContext {
  const filler: EntityGravityInput[] = Array.from({ length: 50 }, (_, i) =>
    person(`filler-${i}`, `Background Person ${i}`, { mentionCount: 1, narrativeImportance: 0.1 }),
  );
  return {
    userId: 'user-test',
    entities: [
      person('rosa', 'Grandma Rosa', {
        roles: ['grandmother'],
        mentionCount: 14,
        relationshipStrength: 9,
        emotionalWeight: 0.7,
        facts: ['Grandma Rosa lives with the family'],
      }),
      person('dax', 'Dax', {
        roles: ['best friend'],
        mentionCount: 12,
        threadCount: 4,
        relationshipStrength: 8,
      }),
      person('mena', 'Mena', {
        roles: [],
        mentionCount: 10,
        emotionalWeight: 0.9,
        facts: ['Mena is the ex girlfriend', 'still missing Mena after the breakup'],
      }),
      person('priya', 'Priya', {
        roles: ['team lead'],
        mentionCount: 6,
        threadCount: 3,
        facts: ['Priya is the team lead at Vanguard Robotics'],
      }),
      person('colt', 'Colt', { roles: ['coworker'], mentionCount: 3 }),
      person('vex', 'Vex', { mentionCount: 2, facts: ['Vex plays in Static Parade'] }),
      place('club-a', 'Neon Cellar'),
      place('club-b', 'The Vault Room'),
      place('club-c', 'Red Static'),
      ...filler,
    ],
    coMentionPairs: [],
    facts: [
      { entityId: 'self', text: "It's my fourth week at Vanguard Robotics and I'm still learning the role" },
      { entityId: 'self', text: 'Building my app Starforge on the weekends' },
      { entityId: 'self', text: 'Trying to pay off debt and get financially stable' },
      { entityId: 'mena', text: 'Still missing Mena since the breakup, moving on slowly' },
      { entityId: 'self', text: "Don't feel welcome in the Static Parade scene anymore, stepping back" },
      { entityId: 'self', text: 'Felt insecure comparing myself to everyone at the club' },
    ],
    relationships: [],
    organizations: [
      { id: 'org-vanguard', name: 'Vanguard Robotics', type: 'company', memberIds: ['priya', 'colt'] },
      { id: 'org-band', name: 'Static Parade', type: 'band', memberIds: ['vex'] },
      { id: 'org-app', name: 'Starforge', type: 'project', memberIds: [] },
    ],
    events: [
      {
        id: 'ev-1',
        title: 'Dance night at Neon Cellar',
        entityIds: ['club-a', 'dax'],
        startDate: daysAgo(2),
        summary: 'club night, dancing',
      },
      {
        id: 'ev-2',
        title: 'Late stop at The Vault Room',
        entityIds: ['club-b', 'dax'],
        startDate: new Date(Date.parse(daysAgo(2)) + 2 * 3_600_000).toISOString(),
        summary: 'second stop of the night',
      },
      {
        id: 'ev-3',
        title: 'Closed out at Red Static',
        entityIds: ['club-c', 'dax'],
        startDate: new Date(Date.parse(daysAgo(2)) + 4 * 3_600_000).toISOString(),
        summary: 'felt anxious but kept dancing',
      },
      {
        id: 'ev-4',
        title: 'First day at Vanguard Robotics',
        entityIds: ['priya'],
        startDate: daysAgo(25),
        summary: 'started a new job',
      },
    ],
    recurringPatterns: [],
  };
}

function fixtureWork(): WorkContext {
  return {
    currentRole: { title: 'QA Technician', status: 'current', confidence: 0.9, evidenceIds: [] },
    organization: { id: 'org-vanguard', name: 'Vanguard Robotics' },
    managers: [],
    leads: [{ displayName: 'Priya', relationship: 'team_lead', confidence: 0.9, evidenceIds: [] }],
    coworkers: [{ displayName: 'Colt', relationship: 'coworker', confidence: 0.8, evidenceIds: [] }],
    tools: [],
    currentTasks: [],
    blockers: [],
    tenure: { phrase: 'fourth week', precision: 'week', confidence: 0.8 },
    correctionsApplied: [],
    warnings: [],
  };
}

function fixtureContext(): NarrativeCognitionContext {
  const recencyByEntity = new Map<string, string>([
    ['rosa', daysAgo(1)],
    ['dax', daysAgo(2)],
    ['mena', daysAgo(3)],
    ['priya', daysAgo(1)],
    ['colt', daysAgo(6)],
    ['vex', daysAgo(80)],
  ]);
  const firstSeenByEntity = new Map<string, string>([
    ['rosa', daysAgo(300)],
    ['dax', daysAgo(280)],
    ['mena', daysAgo(200)],
    ['priya', daysAgo(20)],
    ['colt', daysAgo(18)],
    ['vex', daysAgo(250)],
  ]);
  return {
    graph: fixtureGraph(),
    work: fixtureWork(),
    recencyByEntity,
    firstSeenByEntity,
    now: NOW,
  };
}

describe('detectCognitionQuestion', () => {
  it('routes each cognition question to its kind', () => {
    expect(detectCognitionQuestion('Who matters most to me?')).toBe('who_matters');
    expect(detectCognitionQuestion('who is becoming more important in my life?')).toBe('rising_people');
    expect(detectCognitionQuestion('What era of my life am I in?')).toBe('current_era');
    expect(detectCognitionQuestion('what arcs am I living right now')).toBe('active_arcs');
    expect(detectCognitionQuestion('What changed recently?')).toBe('what_changed');
    expect(detectCognitionQuestion('what has my attention lately?')).toBe('attention');
    expect(detectCognitionQuestion("What's my life about right now?")).toBe('life_summary');
    expect(detectCognitionQuestion('what am I struggling with?')).toBe('struggles');
  });

  it('does not fire on ordinary storytelling or retrieval questions', () => {
    expect(detectCognitionQuestion('I went out to the club last night with Dax')).toBeNull();
    expect(detectCognitionQuestion('Who is Priya?')).toBeNull();
    expect(detectCognitionQuestion('when did I last go out?')).toBeNull();
    expect(detectCognitionQuestion('you forgot my team lead')).toBeNull();
  });
});

describe('salience: who matters most', () => {
  it('returns a SMALL ranked list with reasons, never the whole cast', () => {
    const cctx = fixtureContext();
    const salience = computePersonSalience(
      buildSalienceInputs(cctx.graph, cctx.recencyByEntity, cctx.now),
      cctx.now,
    );
    // 56 characters in the fixture; the answer must stay small.
    expect(salience.length).toBeGreaterThan(50);
    const ranked = rankMostImportant(salience);
    expect(ranked.length).toBeLessThanOrEqual(6);
    const names = ranked.map((p) => p.name);
    expect(names).toContain('Grandma Rosa');
    expect(names).toContain('Mena'); // ended relationship, still emotionally salient
    expect(names.some((n) => n.startsWith('Background Person'))).toBe(false);
    for (const p of ranked) expect(p.reasonBreakdown.length).toBeGreaterThan(0);
  });

  it('composes an answer that explains reasoning and hedges the order', () => {
    const answer = answerCognitionQuestion('who_matters', fixtureContext());
    expect(answer).not.toBeNull();
    expect(answer!.content).toContain('Grandma Rosa');
    expect(answer!.content).toMatch(/less certain|Based on what you've shared/i);
    expect(answer!.content).not.toContain('Background Person 40');
  });
});

describe('era + arcs: one era, many arcs', () => {
  it('resolves the current era from the live work context', () => {
    const cctx = fixtureContext();
    const salience = computePersonSalience(
      buildSalienceInputs(cctx.graph, cctx.recencyByEntity, cctx.now),
      cctx.now,
    );
    const arcs = resolveActiveArcs(cctx.graph, { work: cctx.work, salience });
    const era = resolveCurrentEra(cctx.graph, {
      work: cctx.work,
      arcs,
      salience,
      recencyByEntity: cctx.recencyByEntity,
      now: cctx.now,
    });
    expect(era?.title).toBe('Vanguard Robotics Era');
    expect(era?.themes.join(' ')).toMatch(/QA Technician/);
    expect(era?.arcs.length).toBeGreaterThanOrEqual(3);
  });

  it('detects multiple simultaneous arcs from one era of facts', () => {
    const cctx = fixtureContext();
    const arcs = resolveActiveArcs(cctx.graph, { work: cctx.work });
    const kinds = arcs.map((a) => a.kind);
    expect(kinds).toContain('job_onboarding');
    expect(kinds).toContain('project_build');
    expect(kinds).toContain('relationship_healing');
    expect(kinds).toContain('financial_stability');
    expect(kinds).toContain('community_distance');
    const onboarding = arcs.find((a) => a.kind === 'job_onboarding');
    expect(onboarding?.title).toContain('Vanguard Robotics');
  });
});

describe('what changed recently', () => {
  it('surfaces the new role, new coworkers, and quieter community', () => {
    const cctx = fixtureContext();
    const salience = computePersonSalience(
      buildSalienceInputs(cctx.graph, cctx.recencyByEntity, cctx.now),
      cctx.now,
    );
    const arcs = resolveActiveArcs(cctx.graph, { work: cctx.work, salience });
    const changes = detectRecentChanges(cctx, salience, arcs);
    const labels = changes.map((c) => c.label).join(' | ');
    expect(labels).toContain('QA Technician at Vanguard Robotics');
    expect(labels).toContain('Priya entered your story');
    expect(changes.some((c) => c.kind === 'quieter_community')).toBe(true);
  });
});

describe('story assembly: multi-stop outings become one story', () => {
  it('chains three same-night venue events into one story, in order', () => {
    const cctx = fixtureContext();
    const stories = assembleStories(cctx.graph);
    const outing = latestStory(stories);
    expect(outing).not.toBeNull();
    expect(outing!.isMultiStop).toBe(true);
    expect(outing!.stops.map((s) => s.placeNames[0])).toEqual([
      'Neon Cellar',
      'The Vault Room',
      'Red Static',
    ]);
    expect(outing!.title).toBe('Neon Cellar → The Vault Room → Red Static');
    // The job start 3 weeks earlier stays a separate story.
    expect(stories.some((s) => s.stops.some((stop) => stop.eventId === 'ev-4') && !s.isMultiStop)).toBe(true);
  });

  it('ranks a job start above a club night, story bonus included', () => {
    const cctx = fixtureContext();
    const jobStart = cctx.graph.events.find((e) => e.id === 'ev-4')!;
    const clubNight = cctx.graph.events.find((e) => e.id === 'ev-1')!;
    expect(scoreEventImportance(jobStart).level).toBe('very_high');
    expect(scoreEventImportance(clubNight).level).toBe('medium');
  });
});

describe('thin graphs fall through to normal chat', () => {
  it('returns null instead of guessing when there is nothing to reason over', () => {
    const empty: NarrativeCognitionContext = {
      graph: {
        userId: 'user-test',
        entities: [],
        coMentionPairs: [],
        facts: [],
        relationships: [],
        organizations: [],
        events: [],
        recurringPatterns: [],
      },
      work: null,
      recencyByEntity: new Map(),
      firstSeenByEntity: new Map(),
      now: NOW,
    };
    expect(answerCognitionQuestion('who_matters', empty)).toBeNull();
    expect(answerCognitionQuestion('current_era', empty)).toBeNull();
  });
});
