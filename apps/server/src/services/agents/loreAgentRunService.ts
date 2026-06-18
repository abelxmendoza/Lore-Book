/**
 * LORE AGENT RUN SERVICE
 *
 * Persists agent output to the append-only audit tables:
 *   - lore_agent_runs
 *   - lore_agent_observations
 *   - lore_agent_proposed_actions
 *
 * Every write is non-blocking and best-effort: a logging failure must never
 * break chat. Missing tables (migration not yet applied) degrade silently.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { LoreAgentResult, LoreAgentTrace } from './loreAgentTypes';

export type { LoreAgentTrace };

/** Postgres/PostgREST codes meaning "table does not exist" — treated as no-op. */
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);

function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code != null && MISSING_TABLE_CODES.has(code);
}

class LoreAgentRunService {
  /**
   * Persist a single agent's full result (run row + observations + proposed
   * actions). Returns silently on any failure.
   */
  async persistResult(params: {
    userId: string;
    threadId?: string;
    messageId: string;
    result: LoreAgentResult;
  }): Promise<void> {
    const { userId, threadId, messageId, result } = params;

    try {
      const startedMs = Date.parse(result.startedAt);
      const completedMs = Date.parse(result.completedAt);
      const durationMs =
        Number.isFinite(startedMs) && Number.isFinite(completedMs)
          ? Math.max(0, completedMs - startedMs)
          : null;

      const { error: runError } = await supabaseAdmin.from('lore_agent_runs').insert({
        user_id: userId,
        run_id: result.runId,
        agent_name: result.agentName,
        thread_id: threadId ?? null,
        message_id: messageId,
        status: 'completed',
        confidence: result.confidence,
        started_at: result.startedAt,
        completed_at: result.completedAt,
        duration_ms: durationMs,
        warnings: result.warnings,
      });

      if (runError && !isMissingTable(runError)) {
        logger.warn({ err: runError, agent: result.agentName }, 'LoreAgentRunService: run insert failed');
      }
      if (runError && isMissingTable(runError)) {
        // Table not migrated yet — skip dependent inserts entirely.
        return;
      }

      if (result.observations.length > 0) {
        const { error: obsError } = await supabaseAdmin.from('lore_agent_observations').insert(
          result.observations.map((obs) => ({
            user_id: userId,
            run_id: result.runId,
            agent_name: result.agentName,
            kind: obs.kind,
            summary: obs.summary,
            evidence: obs.evidence,
            confidence: obs.confidence,
          }))
        );
        if (obsError && !isMissingTable(obsError)) {
          logger.warn({ err: obsError, agent: result.agentName }, 'LoreAgentRunService: observations insert failed');
        }
      }

      if (result.proposedActions.length > 0) {
        const { error: actionError } = await supabaseAdmin.from('lore_agent_proposed_actions').insert(
          result.proposedActions.map((action) => ({
            user_id: userId,
            run_id: result.runId,
            agent_name: result.agentName,
            action_type: action.type,
            status: 'proposed',
            payload: action.payload,
            confidence: action.confidence,
            requires_confirmation: action.requiresConfirmation,
            routed_to: action.routeTo,
          }))
        );
        if (actionError && !isMissingTable(actionError)) {
          logger.warn({ err: actionError, agent: result.agentName }, 'LoreAgentRunService: proposed actions insert failed');
        }
      }
    } catch (err) {
      logger.warn({ err, agent: result.agentName }, 'LoreAgentRunService: persistResult threw (non-fatal)');
    }
  }

  /**
   * Read all agent output for one message — used by the dev panel
   * ("How LoreBook Understood This").
   */
  async getTraceByMessage(userId: string, messageId: string): Promise<LoreAgentTrace> {
    const empty: LoreAgentTrace = { runs: [], observations: [], proposedActions: [] };
    try {
      const { data: runs, error: runErr } = await supabaseAdmin
        .from('lore_agent_runs')
        .select('*')
        .eq('user_id', userId)
        .eq('message_id', messageId)
        .order('created_at', { ascending: true });

      if (runErr) {
        if (!isMissingTable(runErr)) logger.warn({ err: runErr, messageId }, 'LoreAgentRunService: trace runs query failed');
        return empty;
      }

      const runIds = (runs ?? []).map((r: { run_id: string }) => r.run_id);
      if (runIds.length === 0) return { runs: runs ?? [], observations: [], proposedActions: [] };

      const [{ data: observations }, { data: proposedActions }] = await Promise.all([
        supabaseAdmin.from('lore_agent_observations').select('*').eq('user_id', userId).in('run_id', runIds),
        supabaseAdmin.from('lore_agent_proposed_actions').select('*').eq('user_id', userId).in('run_id', runIds),
      ]);

      return {
        runs: runs ?? [],
        observations: observations ?? [],
        proposedActions: proposedActions ?? [],
      };
    } catch (err) {
      logger.warn({ err, messageId }, 'LoreAgentRunService: getTraceByMessage threw (non-fatal)');
      return empty;
    }
  }
}

export const loreAgentRunService = new LoreAgentRunService();
