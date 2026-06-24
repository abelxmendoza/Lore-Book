/**
 * Association Promotion Service (Rules 8, 9, 12) — the gatekeeper that decides
 * when accumulated associations are strong enough to be promoted toward
 * membership or to seed a community / friend group.
 *
 *   HARD RULE: Association is the default. Membership must be EARNED.
 *
 * So this service NEVER promotes a single visit/attendance/co-mention into a
 * group. Promotions only fire on accumulated, recurring, multi-signal evidence:
 *
 *   visited/attended (recurring)              → associated_with        (Rule 8)
 *   repeated scene-flavored attendance        → affiliated_with scene  (Rule 4/8)
 *   recurring participation                   → performed_with         (Rule 3)
 *   3+ recurring people + shared anchors      → community / friend grp (Rule 9/12)
 *
 * Explicit membership ("I work at …", "our Coding Club") is NOT handled here —
 * it is asserted directly by the inference orchestrator because the evidence is
 * already maximal.
 */
import { associationEvidenceService } from './associationEvidenceService';
import { PROMOTION_THRESHOLDS, type AssociationEdge, type AssociationType } from './associationTypes';
import type { AssociationGraph } from './associationGraphService';

export interface PromotionDecision {
  edge: AssociationEdge;
  fromType: AssociationType;
  toType: AssociationType;
  reason: string;
}

export interface AffiliationCandidate {
  sceneName: string;
  supportingTargets: string[];
  observations: number;
  reason: string;
}

export interface GroupCandidate {
  kind: 'community' | 'friend_group';
  name: string;
  memberIds: string[];
  memberNames: string[];
  sharedAnchors: string[];
  observations: number;
  reason: string;
}

const SCENE_TOKENS = ['ska', 'goth', 'punk', 'metal', 'hardcore', 'rave', 'emo', 'hip hop', 'hiphop', 'skater', 'reggae', 'cumbia'];

/** Types that are already terminal/explicit and must never be auto-promoted. */
const TERMINAL_TYPES = new Set<AssociationType>(['member_of', 'owns', 'organizes', 'related_to', 'affiliated_with']);

function sources(edge: AssociationEdge): number {
  return associationEvidenceService.distinctSources(edge.supportingEvidence);
}

function sceneTokenIn(name: string): string | null {
  const n = name.toLowerCase();
  for (const tok of SCENE_TOKENS) if (n.includes(tok)) return tok;
  return null;
}

export const associationPromotionService = {
  /**
   * Decide whether a single edge has earned promotion to a stronger TYPE.
   * Returns null when the edge stays where it is (the common, default case).
   */
  evaluateEdge(edge: AssociationEdge): PromotionDecision | null {
    if (TERMINAL_TYPES.has(edge.associationType)) return null;
    if (edge.promotedTo) return null;

    const n = sources(edge);

    if (
      (edge.associationType === 'visited' || edge.associationType === 'attended') &&
      n >= PROMOTION_THRESHOLDS.recurringPresenceToAssociation
    ) {
      return {
        edge,
        fromType: edge.associationType,
        toType: 'associated_with',
        reason: `recurring ${edge.associationType} of ${edge.targetName} across ${n} sources (≥${PROMOTION_THRESHOLDS.recurringPresenceToAssociation})`,
      };
    }

    if (edge.associationType === 'participated_in' && n >= PROMOTION_THRESHOLDS.recurringParticipation) {
      return {
        edge,
        fromType: edge.associationType,
        toType: 'performed_with',
        reason: `recurring participation in ${edge.targetName} across ${n} sources`,
      };
    }

    return null;
  },

  /** Apply all eligible single-edge promotions to a graph. */
  promoteEdges(graph: AssociationGraph): PromotionDecision[] {
    const decisions: PromotionDecision[] = [];
    for (const edge of graph.active()) {
      const decision = this.evaluateEdge(edge);
      if (decision) {
        graph.promote(decision.edge, decision.toType);
        decisions.push(decision);
      }
    }
    return decisions;
  },

  /**
   * Rule 4/8: repeated scene-flavored attendance/visits → an `affiliated_with`
   * scene. Requires the same scene token across several presence edges, not one.
   */
  evaluateSceneAffiliation(graph: AssociationGraph, subjectId: string): AffiliationCandidate[] {
    const presence = graph
      .active({ sourceId: subjectId })
      .filter((e) => ['visited', 'attended', 'participated_in'].includes(e.associationType));

    const byToken = new Map<string, { targets: Set<string>; observations: number }>();
    for (const e of presence) {
      const tok = sceneTokenIn(e.targetName);
      if (!tok) continue;
      const bucket = byToken.get(tok) ?? { targets: new Set<string>(), observations: 0 };
      bucket.targets.add(e.targetName);
      bucket.observations += sources(e);
      byToken.set(tok, bucket);
    }

    const out: AffiliationCandidate[] = [];
    for (const [tok, bucket] of byToken) {
      if (bucket.observations >= PROMOTION_THRESHOLDS.recurringAttendanceToAffiliation) {
        const label = tok.replace(/\b\w/g, (c) => c.toUpperCase());
        out.push({
          sceneName: `${label} Scene`,
          supportingTargets: [...bucket.targets],
          observations: bucket.observations,
          reason: `${bucket.observations} ${tok}-flavored presence observations (≥${PROMOTION_THRESHOLDS.recurringAttendanceToAffiliation})`,
        });
      }
    }
    return out;
  },

  /**
   * Rules 9 & 12: communities and friend groups only emerge from RECURRING
   * shared structure — 3+ recurring people plus shared anchors (venues/scenes/
   * events) plus enough total observations. A single co-mention or a single
   * event can never satisfy this, which is exactly why "Leslie & Tio Family"
   * and "Club Nova Community from one visit" no longer get created.
   */
  evaluateGroupFormation(
    graph: AssociationGraph,
    subjectId: string,
    opts?: { coOccurrence?: Record<string, { people: string[]; anchor: string }[]> },
  ): GroupCandidate[] {
    const out: GroupCandidate[] = [];

    // Recurring people = people the subject is associated with across ≥2 sources.
    const people = graph
      .active({ sourceId: subjectId })
      .filter((e) => e.targetKind === 'person' && sources(e) >= 2);

    const anchors = graph
      .active({ sourceId: subjectId })
      .filter(
        (e) =>
          ['visited', 'attended', 'associated_with', 'affiliated_with', 'participated_in'].includes(e.associationType) &&
          ['venue', 'scene', 'event', 'place'].includes(e.targetKind) &&
          sources(e) >= 2,
      );

    const totalObservations = [...people, ...anchors].reduce((sum, e) => sum + sources(e), 0);

    const enoughPeople = people.length >= PROMOTION_THRESHOLDS.communityMinPeople;
    const enoughAnchors = anchors.length >= 1;
    const enoughObservations = totalObservations >= PROMOTION_THRESHOLDS.communityMinObservations;

    if (enoughPeople && enoughAnchors && enoughObservations) {
      // Prefer a scene anchor for the community name.
      const scene = anchors.find((a) => a.targetKind === 'scene');
      const anchor = scene ?? anchors[0];
      out.push({
        kind: 'community',
        name: scene ? `${scene.targetName} Community` : `${anchor.targetName} Community`,
        memberIds: people.map((p) => p.targetEntityId),
        memberNames: people.map((p) => p.targetName),
        sharedAnchors: anchors.map((a) => a.targetName),
        observations: totalObservations,
        reason: `${people.length} recurring people + ${anchors.length} shared anchors + ${totalObservations} observations (community thresholds met)`,
      });
    } else if (
      people.length >= PROMOTION_THRESHOLDS.friendGroupMinPeople &&
      anchors.filter((a) => a.targetKind === 'event' || a.targetKind === 'venue').length >=
        PROMOTION_THRESHOLDS.friendGroupMinSharedEvents
    ) {
      const sharedEvents = anchors.filter((a) => a.targetKind === 'event' || a.targetKind === 'venue');
      out.push({
        kind: 'friend_group',
        name: 'Friend Group',
        memberIds: people.map((p) => p.targetEntityId),
        memberNames: people.map((p) => p.targetName),
        sharedAnchors: sharedEvents.map((a) => a.targetName),
        observations: totalObservations,
        reason: `${people.length} recurring people share ${sharedEvents.length} events (friend-group thresholds met)`,
      });
    }

    return out;
  },
};
