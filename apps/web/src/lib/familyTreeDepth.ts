import type { FamilyMember, FamilyRelationType, FamilyTree } from '../types/socialRoles';

export type FamilyTreeDepth = 'close' | 'full';

/** Nuclear household of origin / household of one's own — not cousins, grandparents, or in-laws. */
const CLOSE_RELATIONS = new Set<FamilyRelationType>([
  'parent',
  'step_parent',
  'adopted_parent',
  'sibling',
  'twin',
  'half_sibling',
  'step_sibling',
  'child',
  'step_child',
  'adopted_child',
  'spouse',
]);

export function isCloseFamilyMember(member: FamilyMember): boolean {
  if (member.is_self) return true;
  return CLOSE_RELATIONS.has(member.relation);
}

export function filterFamilyTreeByDepth(tree: FamilyTree, depth: FamilyTreeDepth): FamilyTree {
  if (depth === 'full') return tree;
  const members = tree.members.filter(isCloseFamilyMember);
  const ids = new Set(members.map((member) => member.id));
  return {
    ...tree,
    members: members.map((member) => {
      if (member.parent_id && !ids.has(member.parent_id)) {
        return { ...member, parent_id: undefined };
      }
      if (member.paired_with_id && !ids.has(member.paired_with_id)) {
        return { ...member, paired_with_id: undefined };
      }
      return member;
    }),
  };
}

export function familyTreeDepthCounts(tree: FamilyTree): { close: number; full: number } {
  return {
    close: tree.members.filter(isCloseFamilyMember).length,
    full: tree.members.length,
  };
}
