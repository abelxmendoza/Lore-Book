/**
 * Soft reclassification helpers for skill rows (metadata only until executor applies).
 */

import type { SkillMigrationPlanItem } from './skillMigrationTypes';
import { SKILL_MIGRATION_VERSION } from './skillMigrationTypes';

export function buildReclassifyMetadata(
  existing: Record<string, unknown> | null | undefined,
  item: SkillMigrationPlanItem,
): Record<string, unknown> {
  const base = { ...(existing ?? {}) };
  const previous = {
    skill_name: item.originalName,
    entity_type: base.capability_entity_type ?? 'SKILL',
    archived: base.archived ?? false,
  };

  const entityType = String(item.targetEntityType ?? base.capability_entity_type ?? 'SKILL').toUpperCase();
  const hideFromSkillBook =
    ['ARCHIVE_OTHER_PERSON', 'ARCHIVE_FICTION', 'MERGE', 'DEMOTE_TO_PROJECT', 'DEMOTE_TO_ACTIVITY', 'DEMOTE_TO_RESPONSIBILITY', 'DEMOTE_TO_INTEREST'].includes(item.decision)
    || (item.decision === 'RETYPE' && entityType !== 'SKILL' && entityType !== 'PROJECT_APPLICATION');

  return {
    ...base,
    capability_entity_type: entityType,
    migration_status: item.decision.toLowerCase(),
    migration_version: SKILL_MIGRATION_VERSION,
    migration_reason: item.reason,
    migration_previous: previous,
    skill_book_visible: !hideFromSkillBook,
  };
}
