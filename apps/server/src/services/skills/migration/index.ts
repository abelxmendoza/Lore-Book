/**
 * Skills Book ontology migration exports.
 */

export * from './skillMigrationTypes';
export * from './skillDuplicatePlanner';
export * from './skillBookAudit';
export * from './skillRecordReclassifier';
export * from './skillMergeExecutor';
export * from './skillHierarchyMigration';
export * from './skillEvidenceRebuilder';
export * from './skillMigrationRollback';

import fs from 'node:fs/promises';
import path from 'node:path';
import { skillService } from '../skillService';
import { supabaseAdmin } from '../../supabaseClient';
import { auditSkillBook, formatSkillAuditMarkdown } from './skillBookAudit';
import { applySkillMigrationItems } from './skillMergeExecutor';
import type { SkillMigrationSummary } from './skillMigrationTypes';
import type { SkillRowLite } from './skillDuplicatePlanner';

async function loadKnownPersonNames(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('characters')
      .select('name, aliases, is_self, metadata')
      .eq('user_id', userId)
      .limit(500);
    if (error || !data) return [];
    const names: string[] = [];
    for (const row of data) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const isSelf = Boolean(row.is_self) || meta.is_self === true || meta.isSelf === true;
      if (isSelf) continue;
      if (row.name) names.push(String(row.name));
      const aliases = row.aliases;
      if (Array.isArray(aliases)) {
        for (const a of aliases) if (a) names.push(String(a));
      }
    }
    return names;
  } catch {
    return [];
  }
}

export async function executeSkillOntologyMigration(
  userId: string,
  opts: { apply?: boolean } = {},
): Promise<{ summary: SkillMigrationSummary; results: Awaited<ReturnType<typeof applySkillMigrationItems>> }> {
  const skills = await skillService.getSkills(userId, { active_only: false });
  const knownPersonNames = await loadKnownPersonNames(userId);
  const rows: SkillRowLite[] = skills.map((s) => ({
    id: s.id,
    skill_name: s.skill_name,
    description: s.description,
    metadata: s.metadata,
  }));
  const summary = auditSkillBook(userId, rows, {
    dryRun: !opts.apply,
    knownPersonNames,
  });
  const results = await applySkillMigrationItems(userId, summary.items, { apply: opts.apply });
  return { summary: { ...summary, dryRun: !opts.apply }, results };
}

export async function writeSkillMigrationArtifacts(
  summary: SkillMigrationSummary,
  artifactsDir: string,
): Promise<{ jsonPath: string; mdPath: string }> {
  await fs.mkdir(artifactsDir, { recursive: true });
  const stamp = summary.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(artifactsDir, `skills-audit-${summary.userId.slice(0, 8)}-${stamp}.json`);
  const mdPath = path.join(artifactsDir, `skills-audit-${summary.userId.slice(0, 8)}-${stamp}.md`);
  await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2), 'utf8');
  await fs.writeFile(mdPath, formatSkillAuditMarkdown(summary), 'utf8');
  return { jsonPath, mdPath };
}
