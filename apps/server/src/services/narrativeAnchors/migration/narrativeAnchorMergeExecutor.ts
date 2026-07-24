/**
 * Soft-apply narrative anchor migration (metadata + title; no hard deletes).
 */

import { supabaseAdmin } from '../../supabaseClient';
import { NARRATIVE_ANCHOR_MIGRATION_VERSION } from './narrativeAnchorMigrationTypes';
import type { NarrativeAnchorMigrationPlanItem } from './narrativeAnchorMigrationTypes';

export type ApplyResult = {
  anchorId: string;
  decision: string;
  status: 'applied' | 'failed' | 'skipped';
  detail?: string;
};

export async function applyNarrativeAnchorMigrationItems(
  userId: string,
  items: NarrativeAnchorMigrationPlanItem[],
  opts: { apply?: boolean } = {},
): Promise<ApplyResult[]> {
  const apply = Boolean(opts.apply);
  const results: ApplyResult[] = [];

  for (const item of items) {
    if (!apply) {
      results.push({ anchorId: item.anchorId, decision: item.decision, status: 'skipped', detail: 'dry_run' });
      continue;
    }
    if (item.decision === 'KEEP') {
      results.push({ anchorId: item.anchorId, decision: item.decision, status: 'skipped', detail: 'keep' });
      continue;
    }

    try {
      const { data: row, error } = await supabaseAdmin
        .from('narrative_anchors')
        .select('id, title, metadata, provenance')
        .eq('user_id', userId)
        .eq('id', item.anchorId)
        .maybeSingle();
      if (error) throw error;
      if (!row) {
        results.push({ anchorId: item.anchorId, decision: item.decision, status: 'failed', detail: 'not_found' });
        continue;
      }

      const meta: Record<string, unknown> = {
        ...((row.metadata ?? {}) as Record<string, unknown>),
        migration_version: NARRATIVE_ANCHOR_MIGRATION_VERSION,
        migration_status: item.decision.toLowerCase(),
        migration_reason: item.reason,
        migration_previous: { title: row.title },
        anchor_book_visible: !item.decision.startsWith('ROUTE_') && item.decision !== 'ARCHIVE',
        cluster_type: item.decision.startsWith('ROUTE_')
          ? item.decision.replace('ROUTE_', '')
          : 'NARRATIVE_ANCHOR',
        archived: item.decision === 'ARCHIVE',
        routed_to_community: item.decision.startsWith('ROUTE_'),
      };

      const patch: Record<string, unknown> = {
        metadata: meta,
        updated_at: new Date().toISOString(),
      };
      if (item.newTitle) patch.title = item.newTitle;

      const { error: updErr } = await supabaseAdmin
        .from('narrative_anchors')
        .update(patch)
        .eq('user_id', userId)
        .eq('id', item.anchorId);
      if (updErr) throw updErr;

      results.push({ anchorId: item.anchorId, decision: item.decision, status: 'applied' });
    } catch (e) {
      results.push({
        anchorId: item.anchorId,
        decision: item.decision,
        status: 'failed',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return results;
}
