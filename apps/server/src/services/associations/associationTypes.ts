/**
 * Association Graph — shared types + confidence model.
 *
 * This layer sits BETWEEN canonical identity and membership/group inference:
 *
 *   Lexical Intelligence → LoreBook Parser → Canonical Identity
 *     → Association Graph → Membership / Group Inference → Knowledge Graph
 *
 * Core principle (the whole reason this layer exists):
 *
 *   Mention      ≠ Membership
 *   Attendance   ≠ Membership
 *   Affiliation  ≠ Membership
 *
 *   Association is the DEFAULT. Membership must be EARNED through evidence.
 *
 * So a single "I went to Club Nova" produces `visited`, never `member_of`.
 * `member_of` / `community` / `friend_group` are only ever reached by the
 * promotion service once recurring, multi-signal evidence has accumulated, or
 * when membership is stated explicitly ("I work at …", "our Coding Club").
 */

/**
 * Association types ordered (loosely) from weakest to strongest evidentiary
 * weight. `member_of` requires the strongest evidence and is never the output
 * of a single co-mention.
 */
export type AssociationType =
  | 'attended' // showed up to an event ("I went to Ska Prom")
  | 'visited' // went to a place once/occasionally ("I went to Club Nova")
  | 'participated_in' // took part in an activity ("I played with the band")
  | 'associated_with' // recurring soft tie, promoted from visited/attended
  | 'affiliated_with' // identifies with a scene/movement ("I hang out in the ska scene")
  | 'worked_with' // colleague-level tie ("I worked with Gary")
  | 'studied_with' // schoolmate-level tie ("Bryan and I went to Whittier Christian")
  | 'attended_school' // person → institution (school attendance, not membership)
  | 'performed_with' // band/stage tie ("I performed with …")
  | 'lived_with' // household co-residence ("I live with Abuela")
  | 'related_to' // kin/relationship tie
  | 'member_of' // STRONG: explicit membership/employment/ownership
  | 'organizes' // runs/leads a group or event
  | 'owns'; // owns a group/org/venue

/** Kind of the target node an association points at. */
export type AssociationTargetKind =
  | 'person'
  | 'place'
  | 'venue'
  | 'event'
  | 'organization'
  | 'school'
  | 'scene'
  | 'household'
  | 'group'
  | 'unknown';

/**
 * Confidence floor per association type (Rule 13). These are the BASE
 * confidences a freshly-observed edge of each type starts at. Accumulation
 * (relationshipStrengthService) nudges confidence upward with repeated
 * evidence but never past the next tier's floor unless the edge is *promoted*
 * to that stronger type.
 */
export const BASE_CONFIDENCE: Record<AssociationType, number> = {
  attended: 0.4,
  visited: 0.4,
  participated_in: 0.5,
  affiliated_with: 0.6,
  associated_with: 0.7,
  worked_with: 0.5,
  studied_with: 0.5,
  attended_school: 0.55,
  performed_with: 0.5,
  lived_with: 0.6,
  related_to: 0.6,
  member_of: 0.9,
  organizes: 0.8,
  owns: 0.85,
};

/** A bare mention with no relational verb is the weakest possible signal. */
export const MENTION_CONFIDENCE = 0.2;

/** Hard ceiling for any non-explicit (inferred) association. Only explicit
 *  membership/ownership statements may exceed this. */
export const INFERRED_CONFIDENCE_CEILING = 0.85;

/**
 * Promotion thresholds (Rules 8, 9, 12). Promotion is evidence-based: an edge
 * must accumulate this many independent observations before it is eligible to
 * be promoted to the stronger type.
 */
export const PROMOTION_THRESHOLDS = {
  /** visited/attended → associated_with (Rule 8: recurring presence). */
  recurringPresenceToAssociation: 4,
  /** repeated attendance of a scene's events → affiliated_with (Rule 4/8). */
  recurringAttendanceToAffiliation: 3,
  /** participated_in → performed_with/associated_with when recurring (Rule 3). */
  recurringParticipation: 3,
  /** Distinct people who must recur together before a community can form (Rule 9/12). */
  communityMinPeople: 3,
  /** Total weighted observations a community needs before it can be promoted (Rule 9). */
  communityMinObservations: 12,
  /** Distinct recurring people required before a friend group can form (Rule 12). */
  friendGroupMinPeople: 3,
  /** Shared events required before a friend group can form (Rule 12). */
  friendGroupMinSharedEvents: 2,
} as const;

/** A single piece of provenance backing an association observation (Rule 14). */
export interface AssociationEvidence {
  /** The message/source this observation came from. */
  sourceMessageId?: string;
  /** Verbatim quote supporting the association. */
  quote: string;
  /** When the source was authored (ISO 8601). */
  timestamp: string;
  /** Which inference rules fired to produce this observation. */
  rulesFired: string[];
  /** Confidence contributed by this single observation. */
  confidence: number;
}

/** A reference to an entity that may or may not yet be canonicalized. */
export interface EntityRef {
  /** Canonical id once resolved; falls back to a name-derived provisional key. */
  id: string;
  /** Display name. */
  name: string;
  /** What kind of node this is. */
  kind: AssociationTargetKind;
}

/** The graph edge (Rule 15). */
export interface AssociationEdge {
  sourceEntityId: string;
  targetEntityId: string;

  sourceName: string;
  targetName: string;
  targetKind: AssociationTargetKind;

  associationType: AssociationType;

  confidence: number;

  firstSeen: string;
  lastSeen: string;

  mentionCount: number;

  supportingEvidence: AssociationEvidence[];

  /** Set when this edge was upgraded from a weaker type by promotion. */
  promotedFrom?: AssociationType;
  /** Set when this edge has been superseded by a stronger promoted edge. */
  promotedTo?: AssociationType;
}

/**
 * A candidate association produced by an inference rule, before it is folded
 * into the graph. Carries everything needed to create or accumulate an edge.
 */
export interface AssociationObservation {
  source: EntityRef;
  target: EntityRef;
  associationType: AssociationType;
  evidence: AssociationEvidence;
  /** True only for explicit membership/ownership/employment statements. */
  explicit?: boolean;
}

/**
 * Input shared by every inference rule. The subject is the entity the
 * associations radiate from — usually the narrating self ("I went to …"), but
 * any canonical person can be the subject (e.g. when re-scanning a quote about
 * someone else).
 */
export interface InferenceContext {
  text: string;
  /** Entity the associations are about; defaults to the narrating self. */
  subject?: EntityRef;
  sourceMessageId?: string;
  /** ISO timestamp of the source. */
  timestamp?: string;
}

/** The default narrating subject when a context omits one. */
export const SELF_SUBJECT: EntityRef = { id: 'self', name: 'Self', kind: 'person' };

/** Stable provisional id for an entity name when no canonical id is known. */
export function provisionalId(name: string, kind: AssociationTargetKind): string {
  const slug = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `prov:${kind}:${slug || 'unknown'}`;
}

/** Canonical key for an edge (source + target + type). */
export function edgeKey(sourceId: string, targetId: string, type: AssociationType): string {
  return `${sourceId}|${type}|${targetId}`;
}

/** Build an EntityRef, deriving a provisional id when none is supplied. */
export function entityRef(
  name: string,
  kind: AssociationTargetKind,
  id?: string,
): EntityRef {
  return { id: id ?? provisionalId(name, kind), name: (name ?? '').trim(), kind };
}
