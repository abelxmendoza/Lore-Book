/**
 * Dry-run Skills Book audit using cognition + duplicate planner.
 */

import { skillCognitionEngine } from '../skillCognitionEngine';
import { normalizeSkillKey } from '../skillIdentity';
import { planSkillDuplicateMerges, type SkillRowLite } from './skillDuplicatePlanner';
import {
  SKILL_MIGRATION_VERSION,
  type SkillMigrationPlanItem,
  type SkillMigrationSummary,
} from './skillMigrationTypes';

function evidenceFromRow(row: SkillRowLite): string {
  const meta = row.metadata ?? {};
  const origin = String((meta as { origin_story?: string }).origin_story ?? '');
  const desc = row.description ?? '';
  return `${origin} ${desc}`.trim();
}

export function auditSkillBook(
  userId: string,
  rows: SkillRowLite[],
  opts: { dryRun?: boolean; knownPersonNames?: string[] } = {},
): SkillMigrationSummary {
  const dryRun = opts.dryRun !== false;
  const mergePlan = planSkillDuplicateMerges(rows);
  const byId = new Map(mergePlan.map((p) => [p.skillId, p]));
  const items: SkillMigrationPlanItem[] = [];

  for (const row of rows) {
    if (byId.has(row.id)) {
      items.push(byId.get(row.id)!);
      continue;
    }

    const cognition = skillCognitionEngine.evaluate({
      span: row.skill_name,
      evidenceText: evidenceFromRow(row),
      sourceType: 'user_import',
      // Existing book rows: do not mass-archive on coworker co-mentions
      preferUserWhenAmbiguous: true,
      userNames: ['I'],
      knownPersonNames: opts.knownPersonNames,
      knownSkills: rows
        .filter((r) => r.id !== row.id)
        .map((r) => ({ id: r.id, name: r.skill_name })),
    });

    // Only archive when ownership is high-confidence other-person attribution
    if (
      cognition.decision === 'REJECT'
      && cognition.rejectionReason === 'other_person_ownership'
      && cognition.subject.subjectType === 'OTHER_PERSON'
      && cognition.subject.confidence >= 0.85
      && cognition.subject.reasons.some((r) => r.startsWith('other_person_skill_attribution'))
    ) {
      items.push({
        skillId: row.id,
        originalName: row.skill_name,
        decision: 'ARCHIVE_OTHER_PERSON',
        reason: `${cognition.rejectionReason}:${cognition.subject.subjectName ?? 'unknown'}`,
        confidence: cognition.subject.confidence,
        reversible: true,
      });
      continue;
    }

    if (cognition.realityContext === 'FICTION' || cognition.realityContext === 'ROLEPLAY') {
      items.push({
        skillId: row.id,
        originalName: row.skill_name,
        decision: 'ARCHIVE_FICTION',
        reason: `reality_${cognition.realityContext}`,
        confidence: 0.85,
        reversible: true,
      });
      continue;
    }

    if (cognition.decision === 'ROUTE_TO_OTHER_ONTOLOGY') {
      const map: Record<string, SkillMigrationPlanItem['decision']> = {
        ACTIVITY: 'DEMOTE_TO_ACTIVITY',
        HOBBY: 'DEMOTE_TO_ACTIVITY',
        RESPONSIBILITY: 'DEMOTE_TO_RESPONSIBILITY',
        PROJECT: 'DEMOTE_TO_PROJECT',
        INTEREST: 'DEMOTE_TO_INTEREST',
      };
      const decision = map[cognition.routeTarget ?? ''] ?? 'RETYPE';
      items.push({
        skillId: row.id,
        originalName: row.skill_name,
        decision,
        targetEntityType: cognition.routeTarget,
        reason: cognition.rejectionReason ?? 'routed',
        confidence: cognition.existenceConfidence,
        reversible: true,
      });
      continue;
    }

    if (cognition.decision === 'AUTO_MERGE' || cognition.decision === 'SUGGEST_MERGE') {
      // Prefer canonical title as merge target to avoid A↔B mutual merges.
      const targetName = cognition.canonicalTitle || cognition.matchExistingName;
      if (
        targetName
        && normalizeSkillKey(targetName) !== normalizeSkillKey(row.skill_name)
      ) {
        items.push({
          skillId: row.id,
          originalName: row.skill_name,
          decision: 'MERGE',
          targetName,
          reason: `cognition_${cognition.decision}`,
          confidence: cognition.existenceConfidence,
          reversible: true,
        });
        continue;
      }
      if (
        cognition.matchExistingName
        && normalizeSkillKey(cognition.matchExistingName) !== normalizeSkillKey(row.skill_name)
      ) {
        items.push({
          skillId: row.id,
          originalName: row.skill_name,
          decision: 'MERGE',
          targetName: cognition.matchExistingName,
          reason: `cognition_${cognition.decision}`,
          confidence: cognition.existenceConfidence,
          reversible: true,
        });
        continue;
      }
    }

    items.push({
      skillId: row.id,
      originalName: row.skill_name,
      decision: cognition.status === 'needs_review' ? 'NEEDS_REVIEW' : 'KEEP',
      reason: cognition.reasonsAccepted.join(',') || 'keep',
      confidence: cognition.existenceConfidence,
      reversible: true,
    });
  }

  const keepCount = items.filter((i) => i.decision === 'KEEP' || i.decision === 'RENAME').length;
  const mergeCount = items.filter((i) => i.decision === 'MERGE').length;
  const retypeCount = items.filter((i) =>
    ['RETYPE', 'DEMOTE_TO_ACTIVITY', 'DEMOTE_TO_RESPONSIBILITY', 'DEMOTE_TO_PROJECT', 'DEMOTE_TO_INTEREST'].includes(i.decision),
  ).length;
  const archiveCount = items.filter((i) =>
    i.decision === 'ARCHIVE_OTHER_PERSON' || i.decision === 'ARCHIVE_FICTION',
  ).length;
  const reviewCount = items.filter((i) => i.decision === 'NEEDS_REVIEW').length;

  return {
    version: SKILL_MIGRATION_VERSION,
    userId,
    totalRecords: rows.length,
    keepCount,
    mergeCount,
    retypeCount,
    archiveCount,
    reviewCount,
    items,
    dryRun,
    generatedAt: new Date().toISOString(),
  };
}

export function formatSkillAuditMarkdown(summary: SkillMigrationSummary): string {
  const lines = [
    `# Skills Book Audit (${summary.version})`,
    '',
    `- User: ${summary.userId}`,
    `- Dry-run: ${summary.dryRun}`,
    `- Total: ${summary.totalRecords}`,
    `- Keep/rename: ${summary.keepCount}`,
    `- Merge: ${summary.mergeCount}`,
    `- Retype/demote: ${summary.retypeCount}`,
    `- Archive: ${summary.archiveCount}`,
    `- Review: ${summary.reviewCount}`,
    '',
    '## Items',
    '',
  ];
  for (const item of summary.items.slice(0, 100)) {
    lines.push(
      `- **${item.originalName}** → \`${item.decision}\`${item.targetName ? ` (${item.targetName})` : ''}: ${item.reason}`,
    );
  }
  if (summary.items.length > 100) lines.push(`\n…and ${summary.items.length - 100} more`);
  return lines.join('\n');
}
