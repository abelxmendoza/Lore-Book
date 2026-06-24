/**
 * Association Graph Inference Layer — rule tests.
 *
 * These lock in the core principle of the layer:
 *
 *   Mention ≠ Membership · Attendance ≠ Membership · Affiliation ≠ Membership
 *   Association is the default. Membership must be EARNED through evidence.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  associationInferenceService,
  associationPromotionService,
  AssociationGraph,
  type AssociationObservation,
  type AssociationType,
} from '../../../src/services/associations';

const SELF = 'self';

function infer(text: string): AssociationObservation[] {
  return associationInferenceService.infer({ text }).observations;
}

function hasEdge(obs: AssociationObservation[], type: AssociationType, targetMatch: RegExp): boolean {
  return obs.some((o) => o.associationType === type && targetMatch.test(o.target.name));
}

function noEdgeOfType(obs: AssociationObservation[], type: AssociationType): boolean {
  return !obs.some((o) => o.associationType === type);
}

/** Ingest the same utterance `n` times with distinct message ids (recurrence). */
function ingestRepeated(text: string, n: number): AssociationGraph {
  const graph = new AssociationGraph();
  for (let i = 0; i < n; i += 1) {
    associationInferenceService.ingest(
      { text, sourceMessageId: `msg-${i}`, timestamp: new Date(2026, 0, i + 1).toISOString() },
      graph,
    );
  }
  return graph;
}

describe('Association Graph — attendance & visits never become membership', () => {
  it('Rule 1: "I went to Ska Prom" → attended, NOT member_of', () => {
    const obs = infer('I went to Ska Prom');
    expect(hasEdge(obs, 'attended', /ska prom/i)).toBe(true);
    expect(noEdgeOfType(obs, 'member_of')).toBe(true);
  });

  it('Rule 2: "I went to Club Nova" → visited, NOT member_of', () => {
    const obs = infer('I went to Club Nova');
    expect(hasEdge(obs, 'visited', /club nova/i)).toBe(true);
    expect(noEdgeOfType(obs, 'member_of')).toBe(true);
  });
});

describe('Association Graph — relational verbs stay person-level', () => {
  it('Rule 5: "I worked with Gary and Jeff" → worked_with Gary AND worked_with Jeff', () => {
    const obs = infer('I worked with Gary and Jeff');
    expect(hasEdge(obs, 'worked_with', /^gary$/i)).toBe(true);
    expect(hasEdge(obs, 'worked_with', /^jeff$/i)).toBe(true);
    // No manager/boss/membership inferred without evidence.
    expect(noEdgeOfType(obs, 'member_of')).toBe(true);
  });

  it('Rule 6: "Bryan and I went to Whittier Christian" → studied_with Bryan + attended_school', () => {
    const obs = infer('Bryan and I went to Whittier Christian');
    expect(hasEdge(obs, 'studied_with', /^bryan$/i)).toBe(true);
    expect(hasEdge(obs, 'attended_school', /whittier christian/i)).toBe(true);
    expect(noEdgeOfType(obs, 'member_of')).toBe(true);
  });

  it('Rule 7: "I live with Abuela" → lived_with Abuela (no household group yet)', () => {
    const obs = infer('I live with Abuela');
    expect(hasEdge(obs, 'lived_with', /abuela/i)).toBe(true);
    expect(noEdgeOfType(obs, 'member_of')).toBe(true);
  });
});

describe('Association Graph — explicit membership IS allowed', () => {
  it('Rule 10: "I work at Vanguard Robotics" → member_of (employment is explicit)', () => {
    const obs = infer('I work at Vanguard Robotics');
    const member = obs.find((o) => o.associationType === 'member_of' && /vanguard robotics/i.test(o.target.name));
    expect(member).toBeTruthy();
    expect(member?.explicit).toBe(true);
  });

  it('Rule 11: "Our Coding Club" → member_of (ownership/membership is explicit)', () => {
    const obs = infer('We had a great time at our Coding Club today');
    const member = obs.find((o) => o.associationType === 'member_of' && /coding club/i.test(o.target.name));
    expect(member).toBeTruthy();
    expect(member?.explicit).toBe(true);
  });
});

describe('Association Graph — promotion requires accumulated evidence', () => {
  it('Rule 8: recurring Club Nova visits promote visited → associated_with', () => {
    const single = ingestRepeated('I went to Club Nova', 1);
    expect(single.active({ sourceId: SELF, type: 'associated_with' }).some((e) => /club nova/i.test(e.targetName))).toBe(false);

    const recurring = ingestRepeated('I went to Club Nova', 5);
    const promoted = recurring
      .active({ sourceId: SELF, type: 'associated_with' })
      .find((e) => /club nova/i.test(e.targetName));
    expect(promoted).toBeTruthy();
    expect(promoted?.promotedFrom).toBe('visited');
    // Still not membership.
    expect(recurring.active({ sourceId: SELF, type: 'member_of' })).toHaveLength(0);
  });

  it('Rule 4/8: repeated ska-flavored attendance yields an affiliated_with scene candidate', () => {
    const graph = ingestRepeated('I went to a ska show', 3);
    const affiliations = associationPromotionService.evaluateSceneAffiliation(graph, SELF);
    expect(affiliations.some((a) => /ska scene/i.test(a.sceneName))).toBe(true);
  });
});

describe('Association Graph — groups must be earned, never invented', () => {
  it('Rule 9: one event never creates a community', () => {
    const graph = ingestRepeated('I went to Ska Prom', 1);
    const groups = associationPromotionService.evaluateGroupFormation(graph, SELF);
    expect(groups).toHaveLength(0);
  });

  it('Rule 12: "Leslie and Tio" co-mention does NOT create a Family/group', () => {
    const obs = infer('Leslie and Tio were there');
    // Only weak associated_with ties — no family, no membership, no related_to.
    expect(noEdgeOfType(obs, 'member_of')).toBe(true);
    expect(noEdgeOfType(obs, 'related_to')).toBe(true);
    expect(obs.every((o) => o.associationType === 'associated_with')).toBe(true);
    expect(obs.every((o) => o.evidence.confidence <= 0.2)).toBe(true);

    const graph = new AssociationGraph();
    associationInferenceService.ingest({ text: 'Leslie and Tio were there', sourceMessageId: 'm1' }, graph);
    expect(associationPromotionService.evaluateGroupFormation(graph, SELF)).toHaveLength(0);
  });
});
