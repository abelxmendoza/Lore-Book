/**
 * Soft-apply skill migration plans (metadata + optional rename). No hard deletes.
 */

import { supabaseAdmin } from '../../supabaseClient';
import { buildReclassifyMetadata } from './skillRecordReclassifier';
import type { SkillMigrationPlanItem } from './skillMigrationTypes';

export type SkillMigrationApplyResult = {
  skillId: string;
  decision: string;
  status: 'applied' | 'failed' | 'skipped';
  detail?: string;
};

export async function applySkillMigrationItems(
  userId: string,
  items: SkillMigrationPlanItem[],
  opts: { apply?: boolean } = {},
): Promise<SkillMigrationApplyResult[]> {
  const apply = Boolean(opts.apply);
  const results: SkillMigrationApplyResult[] = [];

  for (const item of items) {
    if (!apply) {
      results.push({ skillId: item.skillId, decision: item.decision, status: 'skipped', detail: 'dry_run' });
      continue;
    }

    if (item.decision === 'KEEP') {
      results.push({ skillId: item.skillId, decision: item.decision, status: 'skipped', detail: 'keep' });
      continue;
    }

    try {
      const { data: row, error: fetchErr } = await supabaseAdmin
        .from('skills')
        .select('id, skill_name, metadata, is_active')
        .eq('user_id', userId)
        .eq('id', item.skillId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!row) {
        results.push({ skillId: item.skillId, decision: item.decision, status: 'failed', detail: 'not_found' });
        continue;
      }

      const metadata = buildReclassifyMetadata(
        (row.metadata ?? {}) as Record<string, unknown>,
        item,
      );

      const patch: Record<string, unknown> = {
        metadata,
        updated_at: new Date().toISOString(),
      };

      if (item.decision === 'RENAME' && item.targetName) {
        patch.skill_name = item.targetName;
      }

      if (
        item.decision === 'ARCHIVE_OTHER_PERSON'
        || item.decision === 'ARCHIVE_FICTION'
        || item.decision === 'MERGE'
      ) {
        patch.is_active = false;
        metadata.archived = true;
        metadata.merge_target = item.targetName;
        patch.metadata = metadata;
      }

      const { error: updErr } = await supabaseAdmin
        .from('skills')
        .update(patch)
        .eq('user_id', userId)
        .eq('id', item.skillId);

      if (updErr) throw updErr;
      results.push({ skillId: item.skillId, decision: item.decision, status: 'applied' });
    } catch (e) {
      results.push({
        skillId: item.skillId,
        decision: item.decision,
        status: 'failed',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return results;
}
