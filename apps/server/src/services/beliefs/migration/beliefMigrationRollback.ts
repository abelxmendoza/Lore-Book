import { supabaseAdmin } from '../../supabaseClient';

export async function rollbackBeliefQueueMigration(userId: string): Promise<Array<{
  proposalId: string;
  status: 'restored' | 'skipped' | 'failed';
  detail?: string;
}>> {
  const { data, error } = await supabaseAdmin
    .from('memory_proposals')
    .select('id, metadata, status')
    .eq('user_id', userId)
    .contains('metadata', { belief_cognition_migration: {} })
    .limit(500);

  if (error) throw error;

  const results: Array<{ proposalId: string; status: 'restored' | 'skipped' | 'failed'; detail?: string }> = [];
  for (const row of data ?? []) {
    const meta = { ...(row.metadata as Record<string, unknown>) };
    const prior = meta.belief_cognition_migration_prior as Record<string, unknown> | undefined;
    if (!prior) {
      results.push({ proposalId: row.id, status: 'skipped', detail: 'no_prior_snapshot' });
      continue;
    }
    const { error: updErr } = await supabaseAdmin
      .from('memory_proposals')
      .update({
        claim_text: prior.claim_text,
        status: prior.status ?? row.status,
        metadata: prior.metadata ?? meta,
      })
      .eq('id', row.id)
      .eq('user_id', userId);
    results.push({
      proposalId: row.id,
      status: updErr ? 'failed' : 'restored',
      detail: updErr?.message,
    });
  }
  return results;
}
