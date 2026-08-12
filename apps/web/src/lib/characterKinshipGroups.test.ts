import { describe, expect, it } from 'vitest';
import {
  classifyKinshipType,
  groupKinshipConnections,
  isKinshipConnection,
} from './characterKinshipGroups';

describe('classifyKinshipType', () => {
  it('buckets biological parents', () => {
    for (const type of ['parent', 'mother', 'father', 'mom', 'dad', 'birth_mother', 'biological_father', 'parent_of']) {
      expect(classifyKinshipType(type)).toBe('parents');
    }
  });

  it('buckets step parents ahead of the plain-parent rule', () => {
    for (const type of ['step_parent', 'stepmother', 'step-father', 'stepmom', 'step_parent_of']) {
      expect(classifyKinshipType(type)).toBe('step_parents');
    }
  });

  it('buckets adoptive parents ahead of the plain-parent rule', () => {
    for (const type of ['adopted_parent', 'adoptive_mother', 'adoptive_father', 'adopted_parent_of']) {
      expect(classifyKinshipType(type)).toBe('adopted_parents');
    }
  });

  it('buckets children, step children and adopted children separately', () => {
    expect(classifyKinshipType('daughter')).toBe('children');
    expect(classifyKinshipType('child_of')).toBe('children');
    expect(classifyKinshipType('stepson')).toBe('step_children');
    expect(classifyKinshipType('step_child_of')).toBe('step_children');
    expect(classifyKinshipType('adopted_daughter')).toBe('adopted_children');
    expect(classifyKinshipType('adoptive_child')).toBe('adopted_children');
  });

  it('buckets pets by species word', () => {
    for (const type of ['pet', 'pet_of', 'dog', 'cat', 'rabbit']) {
      expect(classifyKinshipType(type)).toBe('pets');
    }
  });

  it('leaves non-kin and ambiguous owner edges unclassified', () => {
    // `owner_of` would otherwise list a person as one of the character's pets.
    for (const type of ['friend', 'coworker', 'sibling', 'cousin', 'spouse', 'owner_of', '']) {
      expect(classifyKinshipType(type)).toBeNull();
    }
  });
});

describe('groupKinshipConnections', () => {
  const relationships = [
    { character_id: '1', character_name: 'Marcus Sr.', relationship_type: 'father' },
    { character_id: '2', character_name: 'Dana', relationship_type: 'stepmother' },
    { character_id: '3', character_name: 'Rosa', relationship_type: 'adoptive_mother' },
    { character_id: '4', character_name: 'Mia', relationship_type: 'daughter' },
    { character_id: '5', character_name: 'Eli', relationship_type: 'step_child' },
    { character_id: '6', character_name: 'Noor', relationship_type: 'adopted_child' },
    { character_id: '7', character_name: 'Waffles', relationship_type: 'dog' },
    { character_id: '8', character_name: 'Jamie', relationship_type: 'friend' },
  ];

  it('returns non-empty groups in display order', () => {
    expect(groupKinshipConnections(relationships).map((group) => group.key)).toEqual([
      'parents',
      'step_parents',
      'adopted_parents',
      'children',
      'step_children',
      'adopted_children',
      'pets',
    ]);
  });

  it('keeps each person in exactly one group and drops non-kin', () => {
    const groups = groupKinshipConnections(relationships);
    const names = groups.flatMap((group) => group.members.map((m) => m.character_name));
    expect(names).toEqual(['Marcus Sr.', 'Dana', 'Rosa', 'Mia', 'Eli', 'Noor', 'Waffles']);
    expect(names).not.toContain('Jamie');
  });

  it('omits groups with no members', () => {
    const groups = groupKinshipConnections([
      { character_id: '7', character_name: 'Waffles', relationship_type: 'cat' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Pets');
  });
});

describe('isKinshipConnection', () => {
  it('separates kin rows from the flat connections list', () => {
    expect(isKinshipConnection({ relationship_type: 'stepdaughter' })).toBe(true);
    expect(isKinshipConnection({ relationship_type: 'mentor' })).toBe(false);
  });
});
