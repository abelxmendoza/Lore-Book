import fs from 'node:fs/promises';
import path from 'node:path';

import type { BeliefQueueAuditRecord } from '../beliefTypes';

export function buildBeliefAuditSummary(records: BeliefQueueAuditRecord[]): Record<string, number> {
  const summary: Record<string, number> = {
    total: records.length,
  };
  for (const record of records) {
    summary[record.migrationDecision] = (summary[record.migrationDecision] ?? 0) + 1;
    summary[`speech:${record.speechAct}`] = (summary[`speech:${record.speechAct}`] ?? 0) + 1;
  }
  return summary;
}

export function formatBeliefAuditMarkdown(
  records: BeliefQueueAuditRecord[],
  summary: Record<string, number>,
): string {
  const lines = [
    '# Belief Queue Audit',
    '',
    `Total pending proposals: ${summary.total ?? 0}`,
    '',
    '## Summary',
    '',
  ];
  for (const [key, value] of Object.entries(summary).sort()) {
    if (key === 'total') continue;
    lines.push(`- ${key}: ${value}`);
  }
  lines.push('', '## Records', '');
  for (const record of records.slice(0, 200)) {
    lines.push(`### ${record.proposalId}`);
    lines.push(`- Original: ${record.originalText}`);
    lines.push(`- Speech act: ${record.speechAct}`);
    lines.push(`- Decision: ${record.migrationDecision}`);
    lines.push(`- Route: ${record.routingTarget}`);
    if (record.compiledProposition?.renderedText) {
      lines.push(`- Compiled: ${record.compiledProposition.renderedText}`);
    }
    if (record.removedStoryGroupSubject) {
      lines.push(`- Removed story-group subject: ${record.removedStoryGroupSubject}`);
    }
    if (record.warnings.length) lines.push(`- Warnings: ${record.warnings.join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function writeBeliefAuditArtifacts(options: {
  artifactsDir: string;
  records: BeliefQueueAuditRecord[];
  summary: Record<string, number>;
}): Promise<{ jsonPath: string; mdPath: string }> {
  await fs.mkdir(options.artifactsDir, { recursive: true });
  const jsonPath = path.join(options.artifactsDir, 'belief-queue-audit.json');
  const mdPath = path.join(options.artifactsDir, 'belief-queue-audit.md');
  await fs.writeFile(jsonPath, JSON.stringify({ summary: options.summary, records: options.records }, null, 2));
  await fs.writeFile(mdPath, formatBeliefAuditMarkdown(options.records, options.summary));
  return { jsonPath, mdPath };
}
