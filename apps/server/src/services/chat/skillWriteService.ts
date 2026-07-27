/**
 * Explicit Skills book writes from chat — create / rename / delete.
 */

import { normalizeNameKey } from '../../utils/nameNormalization';
import { skillService } from '../skills/skillService';

export type SkillWriteResult = {
  summary: string;
  operation: 'create' | 'rename' | 'delete';
  skillId: string | null;
  skillName: string;
};

function cleanName(raw: string): string {
  return raw
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/[.!?,"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findSkillByName(userId: string, name: string) {
  const key = normalizeNameKey(name);
  const skills = await skillService.getSkills(userId);
  return skills.find((s) => normalizeNameKey(s.skill_name) === key) ?? null;
}

export async function writeSkillFromChat(userId: string, message: string): Promise<SkillWriteResult> {
  const text = message.trim();

  const rename = text.match(/\b(?:rename)\s+(?:the\s+)?skill\s+(.{1,60}?)\s+to\s+(.{1,60})$/i);
  if (rename) {
    const from = cleanName(rename[1]);
    const to = cleanName(rename[2]);
    const existing = await findSkillByName(userId, from);
    if (!existing) throw new Error(`I couldn't find a skill named "${from}".`);
    await skillService.updateSkill(userId, existing.id, { skill_name: to });
    return {
      summary: `Renamed the skill **${existing.skill_name}** to **${to}**.`,
      operation: 'rename',
      skillId: existing.id,
      skillName: to,
    };
  }

  const del = text.match(
    /\b(?:delete|remove)\s+(?:the\s+)?skill\s+(.{1,80})$|\b(?:delete|remove)\s+(.{1,80}?)\s+from\s+(?:my\s+)?skills?(?:\s+book)?\b/i,
  );
  if (del) {
    const name = cleanName(del[1] || del[2] || '');
    const existing = await findSkillByName(userId, name);
    if (!existing) throw new Error(`I couldn't find a skill named "${name}".`);
    await skillService.deleteSkill(userId, existing.id);
    return {
      summary: `Deleted **${existing.skill_name}** from Skills.`,
      operation: 'delete',
      skillId: existing.id,
      skillName: existing.skill_name,
    };
  }

  const create = text.match(
    /\b(?:add|save|put|create)\s+(.{1,80}?)\s+(?:as|to|into)\s+(?:a\s+|an\s+|my\s+)?skill(?:\s+book)?\b/i,
  );
  if (create) {
    const name = cleanName(create[1]);
    const existing = await findSkillByName(userId, name);
    if (existing) {
      return {
        summary: `**${existing.skill_name}** is already in Skills.`,
        operation: 'create',
        skillId: existing.id,
        skillName: existing.skill_name,
      };
    }
    const skill = await skillService.createSkill(userId, {
      skill_name: name,
      skill_category: 'other',
      description: `Created via chat SKILL_WRITE`,
      auto_detected: false,
      metadata: { created_via: 'skill_write' },
    });
    return {
      summary: `Added **${skill.skill_name}** to Skills.`,
      operation: 'create',
      skillId: skill.id ?? null,
      skillName: skill.skill_name,
    };
  }

  throw new Error('Try “add Welding as a skill”, “rename the skill X to Y”, or “delete the skill X”.');
}
