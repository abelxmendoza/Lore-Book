/**
 * LORE AGENT PROPOSAL ROUTER
 *
 * Routes agent proposed actions to existing confirmation surfaces:
 *   memory_review_queue      → memory_proposals (PENDING, never auto-approved)
 *   entity_authority         → entity_authority_decisions (applied=false)
 *   correction_authority     → lore_agent_proposed_actions status=routed (review via trace/trust)
 *
 * Invariants:
 *   - Never applies mutations — only enqueues for human confirmation.
 *   - Idempotent per run_id + action_type + payload fingerprint.
 *   - Best-effort: failures are logged, never thrown to callers.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { selfCharacterService } from '../selfCharacterService';
import type { LoreAgentProposedAction, LoreAgentResult, LoreAgentRouteTarget } from './loreAgentTypes';

const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);

function isMissingTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code != null && MISSING_TABLE_CODES.has(code);
}

export type RouteResult = {
  actionType: string;
  routeTo: LoreAgentRouteTarget;
  ok: boolean;
  downstreamId?: string;
  error?: string;
};

export interface RouteAgentResultsParams {
  userId: string;
  messageId: string;
  runId: string;
  results: LoreAgentResult[];
}

function actionFingerprint(action: LoreAgentProposedAction): string {
  return `${action.type}:${JSON.stringify(action.payload).slice(0, 200)}`;
}

async function resolveSelfEntityId(userId: string): Promise<string | null> {
  try {
    const self = await selfCharacterService.ensureSelfCharacter(userId);
    const id = (self as { id?: string } | null)?.id;
    return id ?? null;
  } catch (err) {
    logger.warn({ err, userId }, 'LoreAgentProposalRouter: ensureSelfCharacter failed');
    return null;
  }
}

async function markProposedActionRouted(params: {
  userId: string;
  runId: string;
  agentName: string;
  actionType: string;
  downstreamId?: string;
  error?: string;
}): Promise<void> {
  try {
    const { data: rows } = await supabaseAdmin
      .from('lore_agent_proposed_actions')
      .select('id, payload')
      .eq('user_id', params.userId)
      .eq('run_id', params.runId)
      .eq('agent_name', params.agentName)
      .eq('action_type', params.actionType)
      .eq('status', 'proposed');

    if (!rows?.length) return;

    for (const row of rows) {
      await supabaseAdmin
        .from('lore_agent_proposed_actions')
        .update({
          status: params.error ? 'proposed' : 'routed',
          payload: {
            ...(row.payload as Record<string, unknown>),
            routing: {
              downstream_id: params.downstreamId ?? null,
              routed_at: new Date().toISOString(),
              error: params.error ?? null,
            },
          },
        })
        .eq('id', row.id);
    }
  } catch (err) {
    logger.warn({ err, runId: params.runId }, 'LoreAgentProposalRouter: markProposedActionRouted failed');
  }
}

async function routeMemoryProposal(
  userId: string,
  messageId: string,
  runId: string,
  action: LoreAgentProposedAction,
  agentName: string
): Promise<RouteResult> {
  const claim = String(action.payload.claim ?? action.label);
  const category = String(action.payload.category ?? 'general');
  const entityId = await resolveSelfEntityId(userId);
  if (!entityId) {
    const error = 'No self entity — cannot enqueue MRQ proposal';
    await markProposedActionRouted({ userId, runId, agentName, actionType: action.type, error });
    return { actionType: action.type, routeTo: action.routeTo, ok: false, error };
  }

  const riskLevel =
    category === 'identity' || action.confidence >= 0.85 ? 'HIGH' : action.confidence >= 0.6 ? 'MEDIUM' : 'LOW';

  try {
    const { data, error } = await supabaseAdmin
      .from('memory_proposals')
      .insert({
        user_id: userId,
        entity_id: entityId,
        claim_text: claim,
        confidence: action.confidence,
        source_excerpt: String(action.payload.source ?? messageId),
        reasoning: `LoreAgent ${agentName}: ${action.label}`,
        affected_claim_ids: [],
        risk_level: riskLevel,
        status: 'PENDING',
        metadata: {
          lore_agent_run_id: runId,
          lore_agent_name: agentName,
          message_id: messageId,
          category,
          requires_confirmation: true,
        },
      })
      .select('id')
      .single();

    if (error) {
      if (isMissingTable(error)) {
        return { actionType: action.type, routeTo: action.routeTo, ok: false, error: 'memory_proposals table missing' };
      }
      await markProposedActionRouted({ userId, runId, agentName, actionType: action.type, error: String(error) });
      return { actionType: action.type, routeTo: action.routeTo, ok: false, error: String(error) };
    }

    await markProposedActionRouted({
      userId,
      runId,
      agentName,
      actionType: action.type,
      downstreamId: data?.id as string,
    });
    return { actionType: action.type, routeTo: action.routeTo, ok: true, downstreamId: data?.id as string };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await markProposedActionRouted({ userId, runId, agentName, actionType: action.type, error });
    return { actionType: action.type, routeTo: action.routeTo, ok: false, error };
  }
}

async function routeEntityProposal(
  userId: string,
  runId: string,
  action: LoreAgentProposedAction,
  agentName: string
): Promise<RouteResult> {
  const payload = action.payload;
  try {
    const { data, error } = await supabaseAdmin
      .from('entity_authority_decisions')
      .insert({
        user_id: userId,
        kind: 'PERSON',
        decision: action.type === 'propose_entity_merge' ? 'MERGE' : action.type === 'propose_alias' ? 'ALIAS' : 'LINK',
        source_name: String(payload.name ?? payload.targetName ?? 'unknown'),
        target_name: String(payload.characterId ?? payload.targetEntityId ?? payload.name ?? 'unknown'),
        confidence: action.confidence,
        reason: action.label,
        evidence: [JSON.stringify(payload).slice(0, 500)],
        status: 'pending',
        applied: false,
        metadata: {
          lore_agent_run_id: runId,
          lore_agent_name: agentName,
          action_type: action.type,
          must_not_auto_merge: payload.mustNotAutoMerge ?? false,
        },
      })
      .select('id')
      .single();

    if (error) {
      if (isMissingTable(error)) {
        return { actionType: action.type, routeTo: action.routeTo, ok: false, error: 'entity_authority_decisions table missing' };
      }
      await markProposedActionRouted({ userId, runId, agentName, actionType: action.type, error: String(error) });
      return { actionType: action.type, routeTo: action.routeTo, ok: false, error: String(error) };
    }

    await markProposedActionRouted({
      userId,
      runId,
      agentName,
      actionType: action.type,
      downstreamId: data?.id as string,
    });
    return { actionType: action.type, routeTo: action.routeTo, ok: true, downstreamId: data?.id as string };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await markProposedActionRouted({ userId, runId, agentName, actionType: action.type, error });
    return { actionType: action.type, routeTo: action.routeTo, ok: false, error };
  }
}

async function routeCorrectionProposal(
  userId: string,
  runId: string,
  action: LoreAgentProposedAction,
  agentName: string
): Promise<RouteResult> {
  // Correction Authority owns truth-state transitions — agent layer only flags review.
  // Mark as routed; downstream review reads lore_agent_proposed_actions + trust center.
  await markProposedActionRouted({
    userId,
    runId,
    agentName,
    actionType: action.type,
    downstreamId: runId,
  });
  return { actionType: action.type, routeTo: action.routeTo, ok: true, downstreamId: runId };
}

async function routeAction(
  userId: string,
  messageId: string,
  runId: string,
  agentName: string,
  action: LoreAgentProposedAction
): Promise<RouteResult | null> {
  if (action.routeTo === 'none') return null;
  if (!action.requiresConfirmation) {
    logger.warn({ agentName, actionType: action.type }, 'LoreAgentProposalRouter: skipping action without requiresConfirmation');
    return null;
  }

  switch (action.routeTo) {
    case 'memory_review_queue':
      return routeMemoryProposal(userId, messageId, runId, action, agentName);
    case 'entity_authority':
      return routeEntityProposal(userId, runId, action, agentName);
    case 'correction_authority':
      return routeCorrectionProposal(userId, runId, action, agentName);
    default:
      return null;
  }
}

/** Route all proposed actions from an agent orchestration pass. */
export async function routeAgentResults(params: RouteAgentResultsParams): Promise<RouteResult[]> {
  const routed: RouteResult[] = [];
  const seen = new Set<string>();

  for (const result of params.results) {
    for (const action of result.proposedActions) {
      const fp = `${result.agentName}:${actionFingerprint(action)}`;
      if (seen.has(fp)) continue;
      seen.add(fp);

      try {
        const outcome = await routeAction(
          params.userId,
          params.messageId,
          params.runId,
          result.agentName,
          action
        );
        if (outcome) routed.push(outcome);
      } catch (err) {
        logger.warn({ err, agent: result.agentName, runId: params.runId }, 'LoreAgentProposalRouter: routeAction threw');
        routed.push({
          actionType: action.type,
          routeTo: action.routeTo,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  logger.info(
    {
      runId: params.runId,
      messageId: params.messageId,
      routed: routed.length,
      ok: routed.filter((r) => r.ok).length,
    },
    'LoreAgentProposalRouter: completed'
  );

  return routed;
}
