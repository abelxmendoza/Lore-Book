/**
 * Propose parent links for hierarchy migration (metadata annotations).
 */

import { resolveSkillHierarchy } from '../skillHierarchyResolver';

export type HierarchyAnnotation = {
  skillName: string;
  parentSkillName?: string;
  relation: string;
};

export function planSkillHierarchyAnnotations(
  skillNames: string[],
): HierarchyAnnotation[] {
  return skillNames.map((name) => {
    const h = resolveSkillHierarchy(name);
    return {
      skillName: name,
      parentSkillName: h.parentSkillName,
      relation: h.parentSkillName ? 'SPECIALIZATION_OF' : 'NONE',
    };
  }).filter((a) => a.parentSkillName);
}
