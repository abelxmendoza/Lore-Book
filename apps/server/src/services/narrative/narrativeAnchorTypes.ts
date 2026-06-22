/**
 * Narrative Anchor types — retrieval structures, not canonical truth.
 * Entities belong to anchors; anchors preserve provenance and explainability.
 */

export type NarrativeAnchorType =
  | 'life_era'
  | 'school_era'
  | 'work_era'
  | 'relationship_arc'
  | 'community'
  | 'family_period'
  | 'project_arc'
  | 'travel_period'
  | 'recurring_activity';

export type AnchorMemberKind = 'entity' | 'event' | 'group' | 'place' | 'activity';

export type AnchorEvidence = {
  id: string;
  label: string;
  source: 'fact' | 'mention' | 'relationship' | 'event' | 'pattern' | 'co_mention' | 'organization';
  sourceRef?: string;
  confidence: number;
};

export type AnchorMember = {
  id: string;
  kind: AnchorMemberKind;
  name: string;
  role?: string;
  gravityScore?: number;
  evidence: AnchorEvidence[];
};

export type NarrativeAnchor = {
  id: string;
  title: string;
  anchorType: NarrativeAnchorType;
  confidence: number;
  gravityScore: number;
  startDate?: string;
  endDate?: string;
  entities: AnchorMember[];
  events: AnchorMember[];
  groups: AnchorMember[];
  places: AnchorMember[];
  evidence: AnchorEvidence[];
  provenance: {
    builtAt: string;
    signals: string[];
    consolidationKey?: string;
  };
};

export type EntityGravityComponents = {
  mentionCount: number;
  threadCount: number;
  daysMentioned: number;
  emotionalWeight: number;
  eventParticipation: number;
  relationshipStrength: number;
  communityMembership: number;
  narrativeImportance: number;
};

export type EntityGravityInput = {
  entityId: string;
  entityType: 'character' | 'location' | 'organization' | 'event' | 'project';
  name: string;
  mentionCount: number;
  threadCount: number;
  daysMentioned: number;
  emotionalWeight: number;
  eventParticipation: number;
  relationshipStrength: number;
  communityMembership: number;
  narrativeImportance: number;
  roles?: string[];
  facts?: string[];
};

export type EntityGravityScore = {
  entityId: string;
  entityType: string;
  name: string;
  gravityScore: number;
  components: EntityGravityComponents;
  roles: string[];
};

export type AnchorBuildFact = {
  entityId: string;
  text: string;
  category?: string;
};

export type AnchorBuildRelationship = {
  sourceId: string;
  targetId: string;
  type: string;
  strength?: number;
};

export type AnchorBuildOrganization = {
  id: string;
  name: string;
  type?: string;
  memberIds: string[];
};

export type AnchorBuildEvent = {
  id: string;
  title: string;
  entityIds: string[];
  startDate?: string;
};

export type AnchorBuildRecurringPattern = {
  pattern: string;
  entityIds: string[];
  cadence: string;
  label?: string;
};

export type AnchorBuildContext = {
  userId: string;
  entities: EntityGravityInput[];
  coMentionPairs: Array<{ a: string; b: string; count: number }>;
  facts: AnchorBuildFact[];
  relationships: AnchorBuildRelationship[];
  organizations: AnchorBuildOrganization[];
  events: AnchorBuildEvent[];
  recurringPatterns: AnchorBuildRecurringPattern[];
};

export type AnchorRetrievalChain = {
  entityId: string;
  entityName: string;
  gravityScore: number;
  anchors: Array<{
    anchorId: string;
    title: string;
    anchorType: NarrativeAnchorType;
    gravityScore: number;
    relatedEntities: string[];
    evidence: AnchorEvidence[];
  }>;
};

export const NARRATIVE_ANCHOR_TYPES: NarrativeAnchorType[] = [
  'life_era',
  'school_era',
  'work_era',
  'relationship_arc',
  'community',
  'family_period',
  'project_arc',
  'travel_period',
  'recurring_activity',
];
