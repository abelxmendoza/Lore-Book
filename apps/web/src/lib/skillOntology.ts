/**
 * Skill cognition ontology metadata (written by server migration / cognition).
 */

export type CapabilityEntityTypeUi =
  | 'SKILL'
  | 'KNOWLEDGE_AREA'
  | 'ACTIVITY'
  | 'HOBBY'
  | 'INTEREST'
  | 'RESPONSIBILITY'
  | 'ROLE'
  | 'PROCESS'
  | 'PROJECT'
  | 'PROJECT_APPLICATION'
  | 'TRAIT'
  | 'CERTIFICATION'
  | 'FIELD_OF_STUDY'
  | 'SOCIAL_CONTEXT'
  | 'OBSERVATION'
  | string;

export type SkillOntologyMeta = {
  capabilityEntityType: CapabilityEntityTypeUi;
  skillBookVisible: boolean;
  migrationStatus?: string;
  migrationReason?: string;
  archived: boolean;
  mergeTarget?: string;
};

export function readSkillOntologyMeta(
  metadata: Record<string, unknown> | null | undefined,
): SkillOntologyMeta {
  const m = metadata ?? {};
  const entity = String(m.capability_entity_type ?? 'SKILL').toUpperCase();
  const archived = m.archived === true || String(m.migration_status ?? '').startsWith('archive');
  const visibleFlag = m.skill_book_visible;
  const skillBookVisible =
    typeof visibleFlag === 'boolean'
      ? visibleFlag
      : !archived && (entity === 'SKILL' || entity === 'PROJECT_APPLICATION' || !m.capability_entity_type);

  return {
    capabilityEntityType: entity,
    skillBookVisible,
    migrationStatus: m.migration_status ? String(m.migration_status) : undefined,
    migrationReason: m.migration_reason ? String(m.migration_reason) : undefined,
    archived,
    mergeTarget: m.merge_target ? String(m.merge_target) : undefined,
  };
}

/** Primary Skills Book grid: durable skills only (hide demoted/archived). */
export function isPrimarySkillBookRecord(
  skill: { is_active?: boolean; metadata?: Record<string, unknown> | null },
): boolean {
  const meta = readSkillOntologyMeta(skill.metadata);
  if (meta.archived) return false;
  if (meta.skillBookVisible === false) return false;
  if (skill.is_active === false && meta.migrationStatus) return false;
  const t = meta.capabilityEntityType;
  if (
    t === 'PROJECT'
    || t === 'ACTIVITY'
    || t === 'HOBBY'
    || t === 'INTEREST'
    || t === 'RESPONSIBILITY'
    || t === 'ROLE'
    || t === 'FIELD_OF_STUDY'
    || t === 'KNOWLEDGE_AREA'
    || t === 'PROCESS'
    || t === 'SOCIAL_CONTEXT'
    || t === 'OBSERVATION'
  ) {
    return false;
  }
  return true;
}

export function capabilityEntityTypeLabel(type: string): string {
  switch (type) {
    case 'SKILL':
      return 'Skill';
    case 'PROJECT':
      return 'Project';
    case 'PROJECT_APPLICATION':
      return 'Applied project';
    case 'ACTIVITY':
      return 'Activity';
    case 'HOBBY':
      return 'Hobby';
    case 'INTEREST':
      return 'Interest';
    case 'RESPONSIBILITY':
      return 'Responsibility';
    case 'ROLE':
      return 'Role';
    case 'KNOWLEDGE_AREA':
      return 'Knowledge';
    case 'FIELD_OF_STUDY':
      return 'Field of study';
    case 'PROCESS':
      return 'Process';
    default:
      return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
