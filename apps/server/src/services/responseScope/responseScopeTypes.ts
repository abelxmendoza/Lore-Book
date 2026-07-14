/**
 * Response Scope Gate — types.
 *
 * Core principle: retrieve broadly, answer narrowly. The retriever may fetch
 * anything; the response layer only forwards evidence that belongs to the
 * domains the user's question is actually about, and internal diagnostics
 * never render in normal chat.
 */

export type ResponseMode =
  | 'chat'
  | 'focused_recall'
  | 'summary'
  | 'debug_inspector'
  | 'audit';

export type LoreBookDomain =
  | 'people'
  | 'organizations'
  | 'work_roles'
  | 'teams'
  | 'work_relationships'
  | 'current_work_timeline'
  | 'family'
  | 'romance'
  | 'music_scene'
  | 'general_biography'
  | 'projects'
  | 'places'
  | 'events'
  | 'quests'
  | 'unrelated_projects'
  | 'private_residences'
  | 'character_audit'
  | 'quest_log'
  | 'full_graph'
  | 'diagnostics';

export type ScopeIntent =
  | 'work'
  | 'family'
  | 'relationship'
  | 'project'
  | 'place'
  | 'event'
  | 'biography'
  | 'general';

export type EntityRef = {
  id?: string;
  name: string;
};

export type ResponseScopePlan = {
  intent: ScopeIntent;
  responseMode: ResponseMode;

  allowedDomains: LoreBookDomain[];
  blockedDomains: LoreBookDomain[];

  primaryEntities: EntityRef[];
  temporalScope?: string;

  /** The user is correcting a previous answer ("you forgot X"). */
  isCorrection: boolean;
  /** Proper names listed in a correction ("you forgot A, B, and C"). */
  correctionNames: string[];

  maxEvidenceItems: number;
  maxCharactersReturned: number;
  includeProvenanceSummary: boolean;
  includeUncertainty: boolean;
};

/** A retrieved evidence item, domain-tagged so the filter can judge it. */
export type ScopedEvidenceItem = {
  id: string;
  title: string;
  content: string;
  domain: LoreBookDomain;
  /** Names of entities this item is about, for entity-relevance checks. */
  entityNames?: string[];
  confidence?: number;
  /** Items the user excluded/corrected away must never resurface. */
  excluded?: boolean;
  evidenceIds?: string[];
};

export type EvidenceFilterResult = {
  accepted: ScopedEvidenceItem[];
  rejected: Array<ScopedEvidenceItem & { rejectedReason: string }>;
};

export type ResponseScopeAuditRecord = {
  at: string;
  userId: string;
  message: string;
  plan: Pick<ResponseScopePlan, 'intent' | 'responseMode' | 'allowedDomains' | 'blockedDomains'>;
  acceptedCount: number;
  rejectedCount: number;
  overflowViolations: string[];
};
