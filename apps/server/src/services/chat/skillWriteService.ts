/**
 * Explicit Skills book writes from chat — create / rename / delete / merge.
 */

import { normalizeNameKey } from '../../utils/nameNormalization';
import { isMatchableBookSkill, readSkillAliases } from '../skills/skillMerge';
import { skillMergeService } from '../skills/skillMergeService';
import { skillService } from '../skills/skillService';

export type SkillWriteResult = {
  summary: string;
  operation: 'create' | 'rename' | 'delete' | 'merge';
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

const SKILL_MERGE_RE =
  /\b(?:merge|fold)\s+(?:the\s+)?(?:skill\s+)?([a-zA-Z][a-zA-Z0-9'’./&+-]*(?:\s+[a-zA-Z][a-zA-Z0-9'’./&+-]*){0,5})\s+into\s+(?:the\s+)?(?:skill\s+)?([a-zA-Z][a-zA-Z0-9'’./&+-]*(?:\s+[a-zA-Z][a-zA-Z0-9'’./&+-]*){0,5})\b/i;

export function parseSkillMerge(message: string): { source: string; target: string } | null {
  const match = message.trim().match(SKILL_MERGE_RE);
  if (!match) return null;
  const source = cleanName(match[1] ?? '');
  const target = cleanName(match[2] ?? '');
  if (!source || !target || source.toLowerCase() === target.toLowerCase()) return null;
  return { source, target };
}

async function findSkillByName(userId: string, name: string) {
  const key = normalizeNameKey(name);
  const skills = await skillService.getSkills(userId);
  return (
    skills.find((skill) => {
      if (!isMatchableBookSkill(skill)) return false;
      if (normalizeNameKey(skill.skill_name) === key) return true;
      return readSkillAliases(skill.metadata).some((alias) => normalizeNameKey(alias) === key);
    }) ?? null
  );
}

export async function writeSkillFromChat(userId: string, message: string): Promise<SkillWriteResult> {
  const text = message.trim();

  const merge = parseSkillMerge(text);
  if (merge) {
    const source = await findSkillByName(userId, merge.source);
    const target = await findSkillByName(userId, merge.target);
    if (!source) throw new Error(`I couldn't find a skill named "${merge.source}".`);
    if (!target) throw new Error(`I couldn't find a skill named "${merge.target}".`);
    const { skill, report } = await skillMergeService.merge(userId, source.id, target.id, {
      reason: 'Merged from chat',
    });
    const aliasNote = report.aliases.length ? ` Aliases: ${report.aliases.join(', ')}.` : '';
    return {
      summary: `Merged **${report.sourceName}** into **${report.targetName}**.${aliasNote} Ask “which skills are similar?” if you want more merge candidates.`,
      operation: 'merge',
      skillId: skill.id ?? target.id,
      skillName: skill.skill_name,
    };
  }

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

  throw new Error(
    'Try “add Welding as a skill”, “merge Prototyping into Hardware Prototyping”, “rename the skill X to Y”, or “delete the skill X”.',
  );
}
