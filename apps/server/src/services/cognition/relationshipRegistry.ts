/** Typed relationship registry — machine-reasonable edges for graph_edges.relation_kind */

export type GraphNodeKind =
  | 'person'
  | 'place'
  | 'organization'
  | 'event'
  | 'relationship'
  | 'skill'
  | 'artifact'
  | 'goal'
  | 'decision'
  | 'concept'
  | 'group';

export type RelationKind =
  | 'WORKS_AT'
  | 'LIVES_IN'
  | 'FRIEND_OF'
  | 'MEMBER_OF'
  | 'ATTENDED'
  | 'HAS_SKILL'
  | 'RELATED_TO'
  | 'CAUSED_BY'
  | 'ACHIEVED'
  | 'CREATED'
  | 'KNOWS'
  | 'MENTORS'
  | 'PARTICIPATED_IN'
  | 'CAUSED'
  | 'LED_TO';

export type RelationSpec = {
  kind: RelationKind;
  subjectKinds: GraphNodeKind[];
  objectKinds: GraphNodeKind[];
  symmetric: boolean;
  temporal: boolean;
  inverse?: RelationKind;
  minEvidenceForLikely: number;
};

export const RELATION_REGISTRY: Record<RelationKind, RelationSpec> = {
  WORKS_AT: {
    kind: 'WORKS_AT',
    subjectKinds: ['person'],
    objectKinds: ['organization'],
    symmetric: false,
    temporal: true,
    inverse: undefined,
    minEvidenceForLikely: 1,
  },
  LIVES_IN: {
    kind: 'LIVES_IN',
    subjectKinds: ['person'],
    objectKinds: ['place'],
    symmetric: false,
    temporal: true,
    minEvidenceForLikely: 1,
  },
  FRIEND_OF: {
    kind: 'FRIEND_OF',
    subjectKinds: ['person'],
    objectKinds: ['person'],
    symmetric: true,
    temporal: true,
    minEvidenceForLikely: 2,
  },
  MEMBER_OF: {
    kind: 'MEMBER_OF',
    subjectKinds: ['person'],
    objectKinds: ['group', 'organization'],
    symmetric: false,
    temporal: true,
    minEvidenceForLikely: 1,
  },
  ATTENDED: {
    kind: 'ATTENDED',
    subjectKinds: ['person'],
    objectKinds: ['event'],
    symmetric: false,
    temporal: false,
    minEvidenceForLikely: 1,
  },
  HAS_SKILL: {
    kind: 'HAS_SKILL',
    subjectKinds: ['person'],
    objectKinds: ['skill'],
    symmetric: false,
    temporal: true,
    minEvidenceForLikely: 1,
  },
  RELATED_TO: {
    kind: 'RELATED_TO',
    subjectKinds: ['person'],
    objectKinds: ['person'],
    symmetric: true,
    temporal: true,
    minEvidenceForLikely: 1,
  },
  CAUSED_BY: {
    kind: 'CAUSED_BY',
    subjectKinds: ['event', 'goal', 'decision'],
    objectKinds: ['event', 'decision'],
    symmetric: false,
    temporal: false,
    inverse: 'CAUSED',
    minEvidenceForLikely: 1,
  },
  ACHIEVED: {
    kind: 'ACHIEVED',
    subjectKinds: ['person'],
    objectKinds: ['goal', 'event'],
    symmetric: false,
    temporal: false,
    minEvidenceForLikely: 1,
  },
  CREATED: {
    kind: 'CREATED',
    subjectKinds: ['person'],
    objectKinds: ['artifact', 'concept'],
    symmetric: false,
    temporal: false,
    minEvidenceForLikely: 1,
  },
  KNOWS: {
    kind: 'KNOWS',
    subjectKinds: ['person'],
    objectKinds: ['person'],
    symmetric: true,
    temporal: true,
    minEvidenceForLikely: 1,
  },
  MENTORS: {
    kind: 'MENTORS',
    subjectKinds: ['person'],
    objectKinds: ['person'],
    symmetric: false,
    temporal: true,
    inverse: undefined,
    minEvidenceForLikely: 1,
  },
  PARTICIPATED_IN: {
    kind: 'PARTICIPATED_IN',
    subjectKinds: ['person'],
    objectKinds: ['event'],
    symmetric: false,
    temporal: false,
    minEvidenceForLikely: 1,
  },
  CAUSED: {
    kind: 'CAUSED',
    subjectKinds: ['event', 'decision'],
    objectKinds: ['event', 'goal', 'decision'],
    symmetric: false,
    temporal: false,
    inverse: 'CAUSED_BY',
    minEvidenceForLikely: 1,
  },
  LED_TO: {
    kind: 'LED_TO',
    subjectKinds: ['event', 'decision'],
    objectKinds: ['event', 'goal', 'decision'],
    symmetric: false,
    temporal: false,
    minEvidenceForLikely: 1,
  },
};

/** Map legacy ER / detector relations to registry kinds. */
export const LEGACY_RELATION_MAP: Record<string, RelationKind> = {
  WORKS_FOR: 'WORKS_AT',
  WORKS_AT: 'WORKS_AT',
  LIVES_WITH: 'LIVES_IN',
  LIVES_IN: 'LIVES_IN',
  FRIEND_OF: 'FRIEND_OF',
  best_friend_of: 'FRIEND_OF',
  MEMBER_OF: 'MEMBER_OF',
  ATTENDED: 'ATTENDED',
  HAS_SKILL: 'HAS_SKILL',
  RELATED_TO: 'RELATED_TO',
  CAUSED: 'CAUSED',
  AFFECTED_BY: 'CAUSED_BY',
  MENTOR_OF: 'MENTORS',
  MENTORS: 'MENTORS',
  PARTICIPATED_IN: 'PARTICIPATED_IN',
  PRESENT_AT: 'ATTENDED',
};

/** Map event_causal_links.causal_type → narrative spine relation. */
export const CAUSAL_TYPE_TO_SPINE: Record<string, 'caused' | 'led_to'> = {
  causes: 'caused',
  triggers: 'caused',
  enables: 'led_to',
  follows_from: 'led_to',
  reaction_to: 'led_to',
  prevents: 'led_to',
  mitigates: 'led_to',
  amplifies: 'caused',
  parallel_to: 'led_to',
  replaces: 'led_to',
};

/** Phrase cues → relation (lexical intelligence). */
export const PHRASE_RELATION_CUES: Array<{ pattern: RegExp; relation: RelationKind; strength: number }> = [
  { pattern: /\bwork(?:ed|s|ing)?\s+at\b/i, relation: 'WORKS_AT', strength: 0.85 },
  { pattern: /\blive(?:d|s|ing)?\s+in\b/i, relation: 'LIVES_IN', strength: 0.85 },
  { pattern: /\bbest\s+friend\b/i, relation: 'FRIEND_OF', strength: 0.9 },
  { pattern: /\bfriend\s+of\b/i, relation: 'FRIEND_OF', strength: 0.75 },
  { pattern: /\bmember\s+of\b/i, relation: 'MEMBER_OF', strength: 0.8 },
  { pattern: /\battended\b/i, relation: 'ATTENDED', strength: 0.8 },
  { pattern: /\b(?:caused|led\s+to|because\s+of)\b/i, relation: 'CAUSED', strength: 0.7 },
  { pattern: /\bcreated\b/i, relation: 'CREATED', strength: 0.75 },
  { pattern: /\bmentor(?:ed|s|ing)?\b/i, relation: 'MENTORS', strength: 0.8 },
];

export function normalizeRelationKind(raw: string): RelationKind | null {
  const upper = raw.trim().toUpperCase().replace(/\s+/g, '_');
  if (upper in RELATION_REGISTRY) return upper as RelationKind;
  if (raw in LEGACY_RELATION_MAP) return LEGACY_RELATION_MAP[raw];
  if (raw.toLowerCase() in LEGACY_RELATION_MAP) return LEGACY_RELATION_MAP[raw.toLowerCase()];
  return null;
}

export function assertValidEdge(
  relation: RelationKind,
  fromKind: GraphNodeKind,
  toKind: GraphNodeKind,
): { valid: boolean; reason?: string } {
  const spec = RELATION_REGISTRY[relation];
  if (!spec) return { valid: false, reason: `Unknown relation: ${relation}` };
  if (!spec.subjectKinds.includes(fromKind)) {
    return { valid: false, reason: `${relation} invalid from ${fromKind}` };
  }
  if (!spec.objectKinds.includes(toKind)) {
    return { valid: false, reason: `${relation} invalid to ${toKind}` };
  }
  return { valid: true };
}

export function detectRelationFromPhrase(text: string): { relation: RelationKind; strength: number } | null {
  for (const cue of PHRASE_RELATION_CUES) {
    if (cue.pattern.test(text)) return { relation: cue.relation, strength: cue.strength };
  }
  return null;
}
