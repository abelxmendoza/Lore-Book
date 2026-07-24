export const NARRATIVE_ANCHOR_MIGRATION_VERSION = 'narrative-anchor-cognition-v1';

export type NarrativeAnchorMigrationDecision =
  | 'KEEP'
  | 'RENAME'
  | 'ROUTE_COMMUNITY'
  | 'ROUTE_HOUSEHOLD'
  | 'ROUTE_FAMILY_GROUP'
  | 'ROUTE_SOCIAL_CIRCLE'
  | 'ARCHIVE'
  | 'NEEDS_REVIEW';

export type NarrativeAnchorMigrationPlanItem = {
  anchorId: string;
  originalTitle: string;
  decision: NarrativeAnchorMigrationDecision;
  newTitle?: string;
  reason: string;
  confidence: number;
  reversible: true;
};

export type NarrativeAnchorMigrationSummary = {
  version: string;
  userId: string;
  totalRecords: number;
  keepCount: number;
  renameCount: number;
  routeCount: number;
  archiveCount: number;
  reviewCount: number;
  items: NarrativeAnchorMigrationPlanItem[];
  dryRun: boolean;
  generatedAt: string;
};
