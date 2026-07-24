export * from './narrativeAnchorMigrationTypes';
export * from './narrativeAnchorAudit';
export * from './narrativeAnchorMergeExecutor';

import fs from 'node:fs/promises';
import path from 'node:path';
import { supabaseAdmin } from '../../supabaseClient';
import { auditNarrativeAnchors, formatNarrativeAnchorAuditMarkdown } from './narrativeAnchorAudit';
import { applyNarrativeAnchorMigrationItems } from './narrativeAnchorMergeExecutor';
import type { NarrativeAnchorMigrationSummary } from './narrativeAnchorMigrationTypes';

export async function executeNarrativeAnchorMigration(
  userId: string,
  opts: { apply?: boolean } = {},
): Promise<{
  summary: NarrativeAnchorMigrationSummary;
  results: Awaited<ReturnType<typeof applyNarrativeAnchorMigrationItems>>;
}> {
  const { data, error } = await supabaseAdmin
    .from('narrative_anchors')
    .select('id, title, anchor_type, evidence, provenance, metadata')
    .eq('user_id', userId)
    .limit(500);
  if (error) throw error;

  const summary = auditNarrativeAnchors(userId, data ?? [], { dryRun: !opts.apply });
  const results = await applyNarrativeAnchorMigrationItems(userId, summary.items, {
    apply: opts.apply,
  });
  return { summary: { ...summary, dryRun: !opts.apply }, results };
}

export async function writeNarrativeAnchorMigrationArtifacts(
  summary: NarrativeAnchorMigrationSummary,
  artifactsDir: string,
): Promise<{ jsonPath: string; mdPath: string }> {
  await fs.mkdir(artifactsDir, { recursive: true });
  const stamp = summary.generatedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(artifactsDir, `anchors-audit-${summary.userId.slice(0, 8)}-${stamp}.json`);
  const mdPath = path.join(artifactsDir, `anchors-audit-${summary.userId.slice(0, 8)}-${stamp}.md`);
  await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2), 'utf8');
  await fs.writeFile(mdPath, formatNarrativeAnchorAuditMarkdown(summary), 'utf8');
  return { jsonPath, mdPath };
}
