import { describe, it, expect } from 'vitest';
import {
  isSyntheticNodeId,
  isFamilyExcluded,
  assessNodeReview,
  applyRelationOverride,
  projectSharedFamilyTreeOntoEgo,
  collectAbsoluteParentChildEdges,
  inferSiblingAndInverseParentEdges,
  inverseFamilyEdgeType,
  type FamilyMemberDTO,
  type FamilyTreeDTO,
} from '../../src/services/familyTreeService';

function member(overrides: Partial<FamilyMemberDTO> = {}): FamilyMemberDTO {
  return {
    id: 'char-1',
    name: 'Grace Rivera',
    relation: 'related',
    relation_label: 'Relative',
    generation: 0,
    ...overrides,
  };
}

describe('familyTreeService — node identity helpers', () => {
  it('flags synthetic (non-character) node ids', () => {
    expect(isSyntheticNodeId('__user__')).toBe(true);
    expect(isSyntheticNodeId('__inferred_parent_unknown__')).toBe(true);
    expect(isSyntheticNodeId('name-3')).toBe(true);
    expect(isSyntheticNodeId('head-x')).toBe(true);
    expect(isSyntheticNodeId('group-y')).toBe(true);
    expect(isSyntheticNodeId('b1c2-uuid-real')).toBe(false);
  });

  it('detects the family_excluded flag in both shapes', () => {
    expect(isFamilyExcluded({ family_excluded: { value: true } })).toBe(true);
    expect(isFamilyExcluded({ family_excluded: true })).toBe(true);
    expect(isFamilyExcluded({ family_excluded: { value: false } })).toBe(false);
    expect(isFamilyExcluded({})).toBe(false);
    expect(isFamilyExcluded(null)).toBe(false);
    expect(isFamilyExcluded(undefined)).toBe(false);
  });
});

describe('familyTreeService — assessNodeReview', () => {
  it('flags handle / stage-name shapes', () => {
    const r = assessNodeReview(member({ name: 'Oscuri.dad', relation: 'parent' }));
    expect(r?.needsReview).toBe(true);
    expect(r?.reason).toMatch(/handle or stage name/i);
  });

  it('flags marked public figures', () => {
    const r = assessNodeReview(member({ name: 'Some Artist', relation: 'parent' }), {
      metadata: { public_figure: true },
    });
    expect(r?.needsReview).toBe(true);
    expect(r?.reason).toMatch(/public figure/i);
  });

  it('flags a trailing (non-leading) kinship word as a nickname', () => {
    const r = assessNodeReview(member({ name: 'Goth Tio', relation: 'uncle' }));
    expect(r?.needsReview).toBe(true);
    expect(r?.reason).toMatch(/not at the start/i);
  });

  it('does NOT flag real title-leading kin', () => {
    expect(assessNodeReview(member({ name: 'Tía Grace', relation: 'aunt' }))).toBeNull();
    expect(assessNodeReview(member({ name: 'Abuela', relation: 'grandparent' }))).toBeNull();
  });

  it('flags a generic relative with no kinship signal', () => {
    const r = assessNodeReview(member({ name: 'Jordan Park', relation: 'related' }));
    expect(r?.needsReview).toBe(true);
    expect(r?.reason).toMatch(/no clear family relationship/i);
  });

  it('never flags self, placeholders, or already-reviewed nodes', () => {
    expect(assessNodeReview(member({ name: 'Oscuri.dad', is_self: true }))).toBeNull();
    expect(assessNodeReview(member({ name: 'Oscuri.dad', is_placeholder: true }))).toBeNull();
    expect(assessNodeReview(member({ name: 'Goth Tio', relation: 'uncle' }), { metadata: { family_reviewed: true } })).toBeNull();
  });
});

describe('familyTreeService — applyRelationOverride', () => {
  it('repositions generation and marks asserted', () => {
    const out = applyRelationOverride(member({ relation: 'related', generation: 0 }), {
      relation: 'aunt',
      side: 'maternal',
    });
    expect(out.relation).toBe('aunt');
    expect(out.generation).toBe(-1);
    expect(out.side).toBe('maternal');
    expect(out.inference_status).toBe('asserted');
  });
});

describe('familyTreeService — bidirectional + shared projection', () => {
  it('inverts parent_of to child_of', () => {
    expect(inverseFamilyEdgeType('parent_of')).toBe('child_of');
    expect(inverseFamilyEdgeType('child_of')).toBe('parent_of');
    expect(inverseFamilyEdgeType('sibling_of')).toBe('sibling_of');
  });

  it('infers sibling edges from shared parents and writes child_of inverses', () => {
    const extra = inferSiblingAndInverseParentEdges([
      { fromId: 'aunt', toId: 'james', type: 'parent_of', confidence: 1 },
      { fromId: 'aunt', toId: 'jerry', type: 'parent_of', confidence: 1 },
    ]);
    expect(extra.some((e) => e.fromId === 'james' && e.toId === 'aunt' && e.type === 'child_of')).toBe(true);
    expect(extra.some((e) => e.fromId === 'james' && e.toId === 'jerry' && e.type === 'sibling_of')).toBe(true);
    expect(extra.some((e) => e.fromId === 'jerry' && e.toId === 'james' && e.type === 'sibling_of')).toBe(true);
  });

  it('projects the shared user tree onto a cousin with the same member roster', () => {
    const shared: FamilyTreeDTO = {
      self_id: 'you',
      branches: [{ side: 'maternal', label: 'Maternal', color: '#f472b6' }],
      members: [
        member({ id: 'you', name: 'Marcus', relation: 'related', relation_label: 'You', generation: 0, is_self: true }),
        member({ id: 'mom', name: 'Mom', kinship_title: 'Mother', relation: 'parent', relation_label: 'Mother', generation: -1, side: 'maternal' }),
        member({ id: 'grace', name: 'Tía Grace', kinship_title: 'Aunt', relation: 'aunt', relation_label: 'Aunt', generation: -1, side: 'maternal' }),
        member({
          id: 'james',
          name: 'James',
          relation: 'cousin',
          relation_label: 'Cousin',
          generation: 0,
          side: 'maternal',
          parent_id: 'grace',
          inference_status: 'asserted',
        }),
        member({
          id: 'jerry',
          name: 'Jerry',
          relation: 'cousin',
          relation_label: 'Cousin',
          generation: 0,
          side: 'maternal',
          parent_id: 'grace',
          inference_status: 'asserted',
        }),
      ],
    };

    expect(collectAbsoluteParentChildEdges(shared)).toEqual(
      expect.arrayContaining([
        { parentId: 'mom', childId: 'you' },
        { parentId: 'grace', childId: 'james' },
        { parentId: 'grace', childId: 'jerry' },
      ]),
    );

    const ontoJames = projectSharedFamilyTreeOntoEgo(shared, 'james');
    expect(ontoJames.self_id).toBe('james');
    expect(ontoJames.members.map((m) => m.id).sort()).toEqual(shared.members.map((m) => m.id).sort());
    expect(ontoJames.members.find((m) => m.id === 'james')?.is_self).toBe(true);
    expect(ontoJames.members.find((m) => m.id === 'grace')?.relation).toBe('parent');
    expect(ontoJames.members.find((m) => m.id === 'jerry')?.relation).toBe('sibling');
    expect(ontoJames.members.find((m) => m.id === 'james')?.parent_id).toBe('grace');
  });
});
