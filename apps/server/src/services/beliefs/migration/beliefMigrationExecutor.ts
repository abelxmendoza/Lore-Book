import { supabaseAdmin } from '../../supabaseClient';
import type { BeliefQueueAuditRecord } from '../beliefTypes';
import { auditBeliefQueue } from './beliefQueueAudit';
import { planBeliefDuplicateMerges } from './beliefDuplicateMigration';
import {
  buildBeliefAuditSummary,
  writeBeliefAuditArtifacts,
} from './beliefMigrationDiagnostics';
import { recompileBeliefRecord } from './beliefRecordRecompiler';

export async function executeBeliefQueueMigration(
  userId: string,
  options: { apply?: boolean; artifactsDir: string },
): Promise<{
  summary: Record<string, number>;
  records: BeliefQueueAuditRecord[];
  applied: number;
  artifacts: { jsonPath: string; mdPath: string };
}> {
  const records = await auditBeliefQueue(userId);
  const summary = buildBeliefAuditSummary(records);
  const artifacts = await writeBeliefAuditArtifacts({
    artifactsDir: options.artifactsDir,
    records,
    summary,
  });

  let applied = 0;
  if (!options.apply) {
    return { summary, records, applied, artifacts };
  }

  const duplicates = planBeliefDuplicateMerges(records);
  for (const plan of duplicates) {
    for (const mergeId of plan.mergeIds) {
      const { error } = await supabaseAdmin
        .from('memory_proposals')
        .update({
          status: 'REJECTED',
          resolved_at: new Date().toISOString(),
          metadata: {
            merge_into: plan.keepId,
            rejection_reason: plan.reason,
            belief_cognition_migration: { decision: 'MERGE_DUPLICATE' },
          },
        })
        .eq('id', mergeId)
        .eq('user_id', userId);
      if (!error) applied += 1;
    }
  }

  for (const record of records) {
    if (record.migrationDecision === 'ARCHIVE_INVALID') {
      const { data: existing } = await supabaseAdmin
        .from('memory_proposals')
        .select('claim_text, status, metadata')
        .eq('id', record.proposalId)
        .eq('user_id', userId)
        .maybeSingle();
      const { error } = await supabaseAdmin
        .from('memory_proposals')
        .update({
          status: 'REJECTED',
          resolved_at: new Date().toISOString(),
          metadata: {
            ...(existing?.metadata as object ?? {}),
            belief_cognition_migration_prior: existing
              ? { claim_text: existing.claim_text, status: existing.status, metadata: existing.metadata }
              : undefined,
            belief_cognition_migration: { decision: 'ARCHIVE_INVALID', speech_act: record.speechAct },
          },
        })
        .eq('id', record.proposalId)
        .eq('user_id', userId);
      if (!error) applied += 1;
      continue;
    }

    const compiled = recompileBeliefRecord(record);
    const { data: existing } = await supabaseAdmin
      .from('memory_proposals')
      .select('claim_text, status, metadata')
      .eq('id', record.proposalId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!existing) continue;

    const { error } = await supabaseAdmin
      .from('memory_proposals')
      .update({
        claim_text: compiled.claimText,
        metadata: {
          ...(existing.metadata as object ?? {}),
          ...compiled.metadataPatch,
          belief_cognition_migration_prior: {
            claim_text: existing.claim_text,
            status: existing.status,
            metadata: existing.metadata,
          },
        },
      })
      .eq('id', record.proposalId)
      .eq('user_id', userId);
    if (!error) applied += 1;
  }

  return { summary, records, applied, artifacts };
}
