import { describe, expect, it } from 'vitest';
import {
  dedupeRelationshipsByPerson,
  relationshipTypeSpecificity,
} from './dedupeCharacterRelationships';

describe('dedupeRelationshipsByPerson', () => {
  it('keeps one row per character_id and prefers typed kinship over family', () => {
    const out = dedupeRelationshipsByPerson([
      {
        id: '1',
        character_id: 'abel',
        character_name: 'Marcus Rivera',
        relationship_type: 'family',
        closeness_score: 5,
      },
      {
        id: '2',
        character_id: 'abel',
        character_name: 'Marcus Rivera',
        relationship_type: 'cousin_of',
        closeness_score: 8,
      },
      {
        id: '3',
        character_id: 'grace',
        character_name: 'Tía Grace',
        relationship_type: 'parent_of',
        closeness_score: 8,
      },
    ]);

    expect(out).toHaveLength(2);
    expect(out.find((r) => r.character_id === 'abel')?.relationship_type).toBe('cousin_of');
    expect(out.find((r) => r.character_id === 'grace')?.relationship_type).toBe('parent_of');
  });

  it('collapses bidirectional duplicates of the same person', () => {
    const out = dedupeRelationshipsByPerson([
      {
        id: 'a',
        character_id: 'james',
        character_name: 'Cousin James',
        relationship_type: 'cousin_of',
        closeness_score: 8,
      },
      {
        id: 'b',
        character_id: 'james',
        character_name: 'Cousin James',
        relationship_type: 'cousin_of',
        closeness_score: 8,
      },
    ]);
    expect(out).toHaveLength(1);
  });

  it('excludes You/Me self placeholders', () => {
    const out = dedupeRelationshipsByPerson([
      { id: '1', character_id: 'self', character_name: 'You', relationship_type: 'cousin' },
      { id: '2', character_id: 'x', character_name: 'Jamie', relationship_type: 'friend' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].character_name).toBe('Jamie');
  });
});

describe('relationshipTypeSpecificity', () => {
  it('ranks typed kinship above generic family', () => {
    expect(relationshipTypeSpecificity('cousin_of')).toBeGreaterThan(
      relationshipTypeSpecificity('family'),
    );
    expect(relationshipTypeSpecificity('mother')).toBeGreaterThan(relationshipTypeSpecificity('friend'));
    expect(relationshipTypeSpecificity('grandson')).toBeGreaterThan(relationshipTypeSpecificity('child'));
  });
});
