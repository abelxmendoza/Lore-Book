import { describe, it, expect } from 'vitest';
import type { FamilyMember, FamilyTree } from '../types/socialRoles';
import {
  familyTreeDepthCounts,
  filterFamilyTreeByDepth,
  isCloseFamilyMember,
} from './familyTreeDepth';

const member = (over: Partial<FamilyMember> & { id: string }): FamilyMember => ({
  name: over.id,
  relation: 'related',
  relation_label: 'Relative',
  generation: 0,
  ...over,
});

const tree = (...members: FamilyMember[]): FamilyTree => ({
  self_id: members.find((m) => m.is_self)?.id ?? members[0]?.id ?? 'me',
  branches: [],
  members,
});

describe('familyTreeDepth', () => {
  const demo = tree(
    member({ id: 'me', name: 'You', is_self: true, relation: 'related' }),
    member({ id: 'mom', name: 'Elena', relation: 'parent', generation: -1 }),
    member({ id: 'sib', name: 'Maya', relation: 'sibling', generation: 0 }),
    member({ id: 'partner', name: 'Sam', relation: 'spouse', generation: 0 }),
    member({ id: 'kid', name: 'Ivy', relation: 'child', generation: 1 }),
    member({ id: 'gma', name: 'Lucia', relation: 'grandparent', generation: -2 }),
    member({ id: 'uncle', name: 'Javier', relation: 'uncle', generation: -1 }),
    member({ id: 'cousin', name: 'Lina', relation: 'cousin', generation: 0 }),
  );

  it('treats parents, siblings, partner, and kids as close family — not aunts or cousins', () => {
    expect(isCloseFamilyMember(demo.members[0])).toBe(true);
    expect(isCloseFamilyMember(demo.members.find((m) => m.id === 'mom')!)).toBe(true);
    expect(isCloseFamilyMember(demo.members.find((m) => m.id === 'uncle')!)).toBe(false);
    expect(isCloseFamilyMember(demo.members.find((m) => m.id === 'cousin')!)).toBe(false);
    expect(isCloseFamilyMember(demo.members.find((m) => m.id === 'gma')!)).toBe(false);
  });

  it('hides extended kin in close view without dropping the nuclear row', () => {
    const close = filterFamilyTreeByDepth(demo, 'close');
    expect(close.members.map((m) => m.id).sort()).toEqual(['kid', 'me', 'mom', 'partner', 'sib']);
    expect(filterFamilyTreeByDepth(demo, 'full')).toBe(demo);
    expect(familyTreeDepthCounts(demo)).toEqual({ close: 5, full: 8 });
  });

  it('drops parent links that would point at a hidden relative', () => {
    const withLink = tree(
      member({ id: 'me', is_self: true }),
      member({ id: 'aunt', relation: 'aunt', generation: -1 }),
      member({ id: 'cousin', relation: 'cousin', generation: 0, parent_id: 'aunt' }),
      member({ id: 'kid', relation: 'child', generation: 1, parent_id: 'me' }),
    );
    const close = filterFamilyTreeByDepth(withLink, 'close');
    expect(close.members.find((m) => m.id === 'cousin')).toBeUndefined();
    expect(close.members.find((m) => m.id === 'kid')?.parent_id).toBe('me');
  });
});
