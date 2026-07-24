/**
 * Skills Book audit / migration types (v1).
 */

export const SKILL_MIGRATION_VERSION = 'skill-cognition-consolidation-v1';

export type SkillMigrationDecision =
  | 'KEEP'
  | 'RENAME'
  | 'MERGE'
  | 'RETYPE'
  | 'DEMOTE_TO_ACTIVITY'
  | 'DEMOTE_TO_RESPONSIBILITY'
  | 'DEMOTE_TO_PROJECT'
  | 'DEMOTE_TO_INTEREST'
  | 'ARCHIVE_OTHER_PERSON'
  | 'ARCHIVE_FICTION'
  | 'NEEDS_REVIEW';

export type SkillMigrationPlanItem = {
  skillId: string;
  originalName: string;
  decision: SkillMigrationDecision;
  targetName?: string;
  targetEntityType?: string;
  reason: string;
  confidence: number;
  reversible: true;
};

export type SkillMigrationSummary = {
  version: string;
  userId: string;
  totalRecords: number;
  keepCount: number;
  mergeCount: number;
  retypeCount: number;
  archiveCount: number;
  reviewCount: number;
  items: SkillMigrationPlanItem[];
  dryRun: boolean;
  generatedAt: string;
};
