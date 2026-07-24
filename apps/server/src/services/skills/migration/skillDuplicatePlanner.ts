/**
 * Plan merges for known near-duplicate skill groups.
 */

import { normalizeSkillKey } from '../skillIdentity';
import type { SkillMigrationDecision, SkillMigrationPlanItem } from './skillMigrationTypes';

export type SkillRowLite = {
  id: string;
  skill_name: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

const MERGE_TARGETS: Array<{ target: string; aliases: string[] }> = [
  {
    target: 'AI-Assisted Coding',
    aliases: ['ai coding tools', 'ai-assisted coding', 'ai assisted coding', 'ai coding'],
  },
  {
    target: 'Front-End Development',
    aliases: ['frontend development', 'front-end development', 'front end development'],
  },
  {
    target: 'Software Debugging',
    aliases: ['debugging', 'software debugging'],
  },
  {
    target: 'Software Product Development',
    aliases: [
      'product development',
      'software product development',
      'product iteration',
      'coding',
      'software development',
    ],
  },
  {
    target: 'Professional Self-Marketing',
    aliases: ['marketing myself', 'personal branding'],
  },
  {
    target: 'Family Support',
    aliases: [
      'family care coordination',
      'family caregiving',
      'family caregiving / errand running',
      'driving and errand coordination',
      'family support',
    ],
  },
  {
    target: 'Social Interaction',
    aliases: [
      'socializing at goth clubs',
      'socializing in goth/underground scenes',
      'socializing in goth underground scenes',
      'social interaction',
      'socializing',
    ],
  },
];

const PROJECT_NAMES = new Set([normalizeSkillKey('lorebook'), normalizeSkillKey('lore book')]);

export function planSkillDuplicateMerges(rows: SkillRowLite[]): SkillMigrationPlanItem[] {
  const items: SkillMigrationPlanItem[] = [];
  const byKey = new Map<string, SkillRowLite>();
  for (const row of rows) byKey.set(normalizeSkillKey(row.skill_name), row);

  for (const group of MERGE_TARGETS) {
    const targetKey = normalizeSkillKey(group.target);
    const members = rows.filter((r) => {
      const k = normalizeSkillKey(r.skill_name);
      return k === targetKey || group.aliases.some((a) => normalizeSkillKey(a) === k);
    });
    if (members.length < 2) {
      // Still rename single alias members to canonical if not already
      for (const m of members) {
        if (normalizeSkillKey(m.skill_name) !== targetKey) {
          items.push({
            skillId: m.id,
            originalName: m.skill_name,
            decision: 'RENAME',
            targetName: group.target,
            reason: `canonical_rename_to_${group.target}`,
            confidence: 0.9,
            reversible: true,
          });
        }
      }
      continue;
    }
    // Keep the best name as survivor, merge others
    const survivor =
      members.find((m) => normalizeSkillKey(m.skill_name) === targetKey) ?? members[0]!;
    for (const m of members) {
      if (m.id === survivor.id) {
        if (normalizeSkillKey(m.skill_name) !== targetKey) {
          items.push({
            skillId: m.id,
            originalName: m.skill_name,
            decision: 'RENAME',
            targetName: group.target,
            reason: 'canonical_rename_survivor',
            confidence: 0.95,
            reversible: true,
          });
        }
        continue;
      }
      items.push({
        skillId: m.id,
        originalName: m.skill_name,
        decision: 'MERGE',
        targetName: group.target,
        reason: `merge_into_${group.target}`,
        confidence: 0.9,
        reversible: true,
      });
    }
  }

  for (const row of rows) {
    if (PROJECT_NAMES.has(normalizeSkillKey(row.skill_name))) {
      items.push({
        skillId: row.id,
        originalName: row.skill_name,
        decision: 'DEMOTE_TO_PROJECT',
        targetName: 'LoreBook',
        targetEntityType: 'PROJECT',
        reason: 'lorebook_is_project_not_skill',
        confidence: 0.95,
        reversible: true,
      });
    }
    if (/lorebook\s+(?:app\s+)?development/i.test(row.skill_name)) {
      items.push({
        skillId: row.id,
        originalName: row.skill_name,
        decision: 'RETYPE',
        targetName: row.skill_name,
        targetEntityType: 'PROJECT_APPLICATION',
        reason: 'lorebook_development_is_project_application',
        confidence: 0.9,
        reversible: true,
      });
    }
    if (/^clubbing$/i.test(row.skill_name.trim())) {
      items.push({
        skillId: row.id,
        originalName: row.skill_name,
        decision: 'DEMOTE_TO_ACTIVITY',
        targetEntityType: 'ACTIVITY',
        reason: 'clubbing_is_activity',
        confidence: 0.9,
        reversible: true,
      });
    }
  }

  // Dedupe plan items by skillId (last wins)
  const byId = new Map<string, SkillMigrationPlanItem>();
  for (const item of items) byId.set(item.skillId, item);
  return Array.from(byId.values());
}

export type { SkillMigrationDecision };
