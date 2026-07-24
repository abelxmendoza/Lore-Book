/**
 * Manual corrections outrank prior inference for skills.
 */

export type SkillCorrection = {
  skillName: string;
  action: 'confirm' | 'reject' | 'rename' | 'merge_into' | 'retype' | 'set_parent';
  targetName?: string;
  entityType?: string;
  note?: string;
  at?: string;
};

/**
 * Apply the highest-priority correction for a skill name, if any.
 */
export function applySkillCorrections(
  skillName: string,
  corrections: SkillCorrection[],
): SkillCorrection | undefined {
  const key = skillName.trim().toLowerCase();
  // Last write wins for same skill
  const matches = corrections.filter((c) => c.skillName.trim().toLowerCase() === key);
  return matches.length ? matches[matches.length - 1] : undefined;
}

export function correctionBlocksCreation(correction?: SkillCorrection): boolean {
  return correction?.action === 'reject';
}

export function correctionForcesConfirm(correction?: SkillCorrection): boolean {
  return correction?.action === 'confirm';
}
