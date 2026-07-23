/**
 * Human-readable + machine-readable migration reports.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PlaceMigrationReport, PlaceOntologyAuditSummary } from './placeMigrationTypes';
import { PLACE_MIGRATION_VERSION } from './placeMigrationTypes';

export function buildAuditSummary(
  userId: string,
  reports: PlaceMigrationReport[],
): PlaceOntologyAuditSummary {
  const byDecision: Record<string, number> = {};
  for (const report of reports) {
    byDecision[report.decision] = (byDecision[report.decision] ?? 0) + 1;
  }

  const moveDecisions = new Set([
    'MOVE_TO_EVENT',
    'MOVE_TO_PERSON',
    'MOVE_TO_OBJECT',
    'MOVE_TO_FIELD',
    'MOVE_TO_COMMUNITY',
    'DEMOTE_TO_CONTEXT_REFERENCE',
  ]);

  return {
    migrationVersion: PLACE_MIGRATION_VERSION,
    userId,
    generatedAt: new Date().toISOString(),
    totalRecords: reports.length,
    byDecision,
    keepCount: reports.filter((r) => r.decision === 'KEEP' || r.decision === 'KEEP_AND_RETYPE' || r.decision === 'RENAME' || r.decision === 'RENAME_AND_RETYPE').length,
    moveCount: reports.filter((r) => moveDecisions.has(r.decision)).length,
    archiveCount: reports.filter((r) => r.decision === 'ARCHIVE_INVALID' || r.decision === 'SPLIT').length,
    reviewCount: reports.filter((r) => r.decision === 'NEEDS_REVIEW').length,
    reports,
  };
}

export function formatMigrationReportMarkdown(summary: PlaceOntologyAuditSummary): string {
  const lines: string[] = [
    `# Place Ontology Migration Report`,
    ``,
    `- Version: \`${summary.migrationVersion}\``,
    `- Generated: ${summary.generatedAt}`,
    `- Records: ${summary.totalRecords}`,
    `- Keep/retype/rename: ${summary.keepCount}`,
    `- Move/demote: ${summary.moveCount}`,
    `- Archive/split: ${summary.archiveCount}`,
    `- Needs review: ${summary.reviewCount}`,
    ``,
    `## By decision`,
    ``,
  ];

  for (const [decision, count] of Object.entries(summary.byDecision).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${decision}**: ${count}`);
  }

  lines.push(``, `## Records`, ``);

  for (const report of summary.reports) {
    lines.push(`### ${report.originalTitle}`);
    lines.push(``);
    lines.push(`- Decision: \`${report.decision}\``);
    if (report.canonicalTitle) lines.push(`- Canonical: ${report.canonicalTitle}`);
    if (report.oldType || report.newType) {
      lines.push(`- Type: ${report.oldType ?? '(none)'} → ${report.newType ?? report.targetEntityType ?? '(unchanged)'}`);
    }
    if (report.targetEntityType) lines.push(`- Target ontology: ${report.targetEntityType}`);
    lines.push(
      `- Counts: mentions ${report.oldCounts.mentionCount}→${report.newCounts.mentionCount}, visits ${report.oldCounts.explicitVisitCount}→${report.newCounts.explicitVisitCount}, attendance ${report.oldCounts.attendanceAtPlaceCount}→${report.newCounts.attendanceAtPlaceCount}`,
    );
    if (report.removedPeople.length) lines.push(`- Removed people: ${report.removedPeople.join(', ')}`);
    if (report.removedTags.length) lines.push(`- Removed tags: ${report.removedTags.join(', ')}`);
    if (report.warnings.length) lines.push(`- Warnings: ${report.warnings.join('; ')}`);
    lines.push(`- Confidence: ${report.confidence.toFixed(2)}`);
    lines.push(``);
  }

  return lines.join('\n');
}

export async function writeMigrationArtifacts(
  summary: PlaceOntologyAuditSummary,
  outDir = path.resolve(process.cwd(), '../../artifacts'),
): Promise<{ jsonPath: string; mdPath: string }> {
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'place-migration-report.json');
  const mdPath = path.join(outDir, 'place-migration-report.md');
  await writeFile(jsonPath, JSON.stringify(summary, null, 2), 'utf8');
  await writeFile(mdPath, formatMigrationReportMarkdown(summary), 'utf8');
  return { jsonPath, mdPath };
}
