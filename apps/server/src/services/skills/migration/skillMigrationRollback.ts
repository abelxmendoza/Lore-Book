/**
 * Rollback soft skill migrations using migration_previous metadata.
 */

import { supabaseAdmin } from '../../supabaseClient';
import { SKILL_MIGRATION_VERSION } from './skillMigrationTypes';

export type SkillRollbackResult = {
  skillId: string;
  status: 'restored' | 'skipped' | 'failed';
  detail?: string;
};

export async function rollbackSkillOntologyMigration(userId: string): Promise<SkillRollbackResult[]> {
  const { data, error } = await supabaseAdmin
    .from('skills')
    .select('id, skill_name, metadata, is_active')
    .eq('user_id', userId);

  if (error) throw error;
  const rows = data ?? [];
  const results: SkillRollbackResult[] = [];

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.migration_version !== SKILL_MIGRATION_VERSION) {
      results.push({ skillId: row.id, status: 'skipped', detail: 'no_migration_marker' });
      continue;
    }
    const prev = meta.migration_previous as
      | { skill_name?: string; entity_type?: string; archived?: boolean }
      | undefined;
    if (!prev) {
      results.push({ skillId: row.id, status: 'skipped', detail: 'no_previous_snapshot' });
      continue;
    }

    try {
      const nextMeta = { ...meta };
      delete nextMeta.migration_status;
      delete nextMeta.migration_version;
      delete nextMeta.migration_reason;
      delete nextMeta.migration_previous;
      delete nextMeta.merge_target;
      if (prev.entity_type) nextMeta.capability_entity_type = prev.entity_type;
      nextMeta.skill_book_visible = true;
      nextMeta.archived = Boolean(prev.archived);

      const { error: updErr } = await supabaseAdmin
        .from('skills')
        .update({
          skill_name: prev.skill_name ?? row.skill_name,
          is_active: prev.archived ? false : true,
          metadata: nextMeta,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('id', row.id);

      if (updErr) throw updErr;
      results.push({ skillId: row.id, status: 'restored' });
    } catch (e) {
      results.push({
        skillId: row.id,
        status: 'failed',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return results;
}
