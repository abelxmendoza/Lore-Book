import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';

import { lifeArcProposalService } from './lifeArcProposalService';

const DEBOUNCE_MS = 3_000;
const pendingRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function proposalMetadataAffectsSwimlanes(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata) return true;
  const source = metadata.source;
  if (source === 'chatgpt_export' || source === 'chatgpt_memory_handoff') return true;
  if (typeof metadata.group_label === 'string' && metadata.group_label.startsWith('ChatGPT import')) {
    return true;
  }
  const category = metadata.category;
  if (category === 'preferences_habits' || category === 'goals_values') return false;
  if (category === 'timeline' || category === 'places_organizations' || category === 'relationships') {
    return true;
  }
  return true;
}

export function shouldAutoCreateReadyAfterApproval(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata) return false;
  const source = metadata.source;
  if (source === 'chatgpt_export' || source === 'chatgpt_memory_handoff') return true;
  if (metadata.category === 'timeline') return true;
  if (typeof metadata.group_label === 'string' && metadata.group_label.startsWith('ChatGPT import · Timeline')) {
    return true;
  }
  return false;
}

export async function enqueueLifeArcProposalRebuild(userId: string, reason: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('life_arc_proposal_rebuild_requests')
    .upsert(
      {
        user_id: userId,
        reason,
        requested_at: new Date().toISOString(),
        attempts: 0,
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
    logger.warn({ error, userId, reason }, 'Failed to enqueue life arc proposal rebuild');
  }
}

/**
 * Coalesce rapid MRQ approvals into one rebuild, then persist proposals (and optionally ready bars).
 */
export function scheduleLifeArcProposalRefresh(
  userId: string,
  opts: { reason?: string; autoCreateReady?: boolean } = {},
): void {
  const reason = opts.reason ?? 'memory_review';
  void enqueueLifeArcProposalRebuild(userId, reason);

  const existing = pendingRefreshTimers.get(userId);
  if (existing) clearTimeout(existing);

  pendingRefreshTimers.set(
    userId,
    setTimeout(() => {
      pendingRefreshTimers.delete(userId);
      void lifeArcProposalService
        .build(userId, true, { autoCreateReady: opts.autoCreateReady ?? false })
        .then((result) => {
          logger.info(
            {
              userId,
              reason,
              proposedArcs: result.audit.proposedArcs,
              autoCreated: result.autoCreated?.length ?? 0,
            },
            'Life arc proposals refreshed after memory review',
          );
        })
        .catch((err) => {
          logger.warn({ err, userId, reason }, 'Debounced life arc proposal refresh failed');
        });
    }, DEBOUNCE_MS),
  );
}

/** Test helper */
export function clearLifeArcProposalRefreshTimers(): void {
  for (const timer of pendingRefreshTimers.values()) clearTimeout(timer);
  pendingRefreshTimers.clear();
}
