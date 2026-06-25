import { describe, it, expect } from 'vitest';
import {
  isSyntheticNodeId,
  isFamilyExcluded,
  assessNodeReview,
  applyRelationOverride,
  type FamilyMemberDTO,
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
    const r = assessNodeReview(member({ name: 'Some Artist', relation: 'related' }), {
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
  it('rewrites relation, label, generation, and side, and marks it asserted', () => {
    const out = applyRelationOverride(member({ generation: 0, relation: 'related' }), {
      relation: 'aunt',
      side: 'maternal',
    });
    expect(out.relation).toBe('aunt');
    expect(out.relation_label).toBe('Aunt');
    expect(out.generation).toBe(-1);
    expect(out.side).toBe('maternal');
    expect(out.inference_status).toBe('asserted');
  });

  it('places a child below the user', () => {
    const out = applyRelationOverride(member(), { relation: 'child' });
    expect(out.generation).toBe(1);
  });
});
