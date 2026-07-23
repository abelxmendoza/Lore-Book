/**
 * Place Ontology Repair & Migration v1 — shared types.
 * Existing registry rows are not automatically valid Places.
 */

export const PLACE_MIGRATION_VERSION = 'place-ontology-repair-v1';

export type PlaceMigrationDecision =
  | 'KEEP'
  | 'KEEP_AND_RETYPE'
  | 'RENAME'
  | 'RENAME_AND_RETYPE'
  | 'MERGE'
  | 'SPLIT'
  | 'MOVE_TO_EVENT'
  | 'MOVE_TO_PERSON'
  | 'MOVE_TO_OBJECT'
  | 'MOVE_TO_FIELD'
  | 'MOVE_TO_COMMUNITY'
  | 'DEMOTE_TO_CONTEXT_REFERENCE'
  | 'ARCHIVE_INVALID'
  | 'NEEDS_REVIEW';

export type PlaceEvidenceCounts = {
  mentionCount: number;
  explicitVisitCount: number;
  attendanceAtPlaceCount: number;
  residenceCount: number;
  workplaceCount: number;
  plannedVisitCount: number;
  hypotheticalCount: number;
  uniqueSourceCount: number;
};

export type PersonPlaceRelation =
  | 'VISITED'
  | 'LIVED_AT'
  | 'WORKED_AT'
  | 'STUDIED_AT'
  | 'GRADUATED_FROM'
  | 'MET_AT'
  | 'ATTENDED_EVENT_AT'
  | 'TRAVELED_WITH'
  | 'OWNS'
  | 'OPERATES'
  | 'MENTIONED_IN_CONTEXT_OF';

export type PlaceTagGroups = {
  intrinsicTags: string[];
  activityTags: string[];
  visitContextTags: string[];
  storyAssociationTags: string[];
  importedSourceTags: string[];
};

export type TemporalPlaceAlias = {
  alias: string;
  resolvedPlaceId?: string;
  resolvedPlaceName?: string;
  validFrom?: string;
  validTo?: string;
  confidence: number;
  evidenceIds: string[];
};

export type PlaceMigrationTargetOntology =
  | 'PLACE'
  | 'EVENT'
  | 'PERSON'
  | 'UNRESOLVED_PERSON'
  | 'VEHICLE'
  | 'NAMED_OBJECT'
  | 'FIELD_OF_STUDY'
  | 'SOCIAL_SCENE'
  | 'COMMUNITY'
  | 'CONTEXT_REFERENCE';

export type PlaceMigrationPlanItem = {
  placeId: string;
  originalTitle: string;
  decision: PlaceMigrationDecision;
  canonicalTitle?: string;
  oldType?: string | null;
  newType?: string;
  targetEntityType?: PlaceMigrationTargetOntology;
  aliases?: string[];
  mergeTargetId?: string;
  mergeTargetName?: string;
  splitTargets?: Array<{ name: string; existingId?: string }>;
  demoteReason?: string;
  temporalAlias?: TemporalPlaceAlias;
  confidence: number;
  warnings: string[];
  rulesFired: string[];
};

export type PlaceMigrationReport = {
  placeId: string;
  originalTitle: string;
  decision: PlaceMigrationDecision;
  canonicalTitle?: string;
  oldType?: string | null;
  newType?: string;
  targetEntityType?: PlaceMigrationTargetOntology;
  oldCounts: PlaceEvidenceCounts;
  newCounts: PlaceEvidenceCounts;
  removedPeople: string[];
  addedRelationships: string[];
  removedTags: string[];
  retainedTags: string[];
  movedTags: string[];
  tagGroups: PlaceTagGroups;
  mergeTargetId?: string;
  splitTargetIds?: string[];
  evidenceIds: string[];
  warnings: string[];
  confidence: number;
  rulesFired: string[];
};

export type PlaceMigrationSnapshot = {
  id: string;
  name: string;
  type: string | null;
  aliases: string[] | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  spatial_category: string | null;
  spatial_subcategory: string | null;
  associated_character_ids: string[] | null;
};

export type PlaceMigrationApplyResult = {
  placeId: string;
  decision: PlaceMigrationDecision;
  status: 'applied' | 'skipped' | 'failed';
  detail?: string;
};

export type PlaceOntologyAuditSummary = {
  migrationVersion: string;
  userId: string;
  generatedAt: string;
  totalRecords: number;
  byDecision: Record<string, number>;
  keepCount: number;
  moveCount: number;
  archiveCount: number;
  reviewCount: number;
  reports: PlaceMigrationReport[];
};

export function emptyEvidenceCounts(): PlaceEvidenceCounts {
  return {
    mentionCount: 0,
    explicitVisitCount: 0,
    attendanceAtPlaceCount: 0,
    residenceCount: 0,
    workplaceCount: 0,
    plannedVisitCount: 0,
    hypotheticalCount: 0,
    uniqueSourceCount: 0,
  };
}

export function emptyTagGroups(): PlaceTagGroups {
  return {
    intrinsicTags: [],
    activityTags: [],
    visitContextTags: [],
    storyAssociationTags: [],
    importedSourceTags: [],
  };
}
