import { describe, expect, it } from 'vitest';
import {
  capabilityEntityTypeLabel,
  isPrimarySkillBookRecord,
  readSkillOntologyMeta,
} from './skillOntology';

describe('skillOntology', () => {
  it('treats plain skills as primary book records', () => {
    expect(isPrimarySkillBookRecord({ is_active: true, metadata: {} })).toBe(true);
  });

  it('keeps project applications out of the primary skill grid', () => {
    expect(
      isPrimarySkillBookRecord({
        is_active: true,
        metadata: { capability_entity_type: 'PROJECT_APPLICATION', skill_book_visible: true },
      }),
    ).toBe(false);
  });

  it('hides demoted projects and activities from primary book', () => {
    expect(
      isPrimarySkillBookRecord({
        is_active: true,
        metadata: { capability_entity_type: 'PROJECT', skill_book_visible: false },
      }),
    ).toBe(false);
    expect(
      isPrimarySkillBookRecord({
        is_active: false,
        metadata: {
          capability_entity_type: 'ACTIVITY',
          migration_status: 'demote_to_activity',
          skill_book_visible: false,
        },
      }),
    ).toBe(false);
  });

  it('hides archived merges', () => {
    expect(
      isPrimarySkillBookRecord({
        is_active: false,
        metadata: { archived: true, migration_status: 'merge', merge_target: 'Family Support' },
      }),
    ).toBe(false);
  });

  it('labels entity types for UI', () => {
    expect(capabilityEntityTypeLabel('FIELD_OF_STUDY')).toBe('Field of study');
    expect(readSkillOntologyMeta({ capability_entity_type: 'KNOWLEDGE_AREA' }).capabilityEntityType).toBe(
      'KNOWLEDGE_AREA',
    );
  });
});
