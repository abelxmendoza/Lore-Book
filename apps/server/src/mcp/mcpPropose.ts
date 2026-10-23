/**
 * Agent propose tools. These insert PENDING memory_proposals only.
 * Nothing here approves, edits canon, or calls autoApprove.
 */

import { z } from 'zod';

import { logger } from '../logger';
import { auditMcpToolCall } from './mcpAuditService';
import { canProposeMemory } from './mcpScopes';
import type { McpAuthContext } from './types';

export const proposeChronicleInputSchema = {
  summary: z.string().min(20).max(4_000),
  source_agent: z.string().min(1).max(60),
  repo: z.string().max(120).optional(),
  session_id: z.string().max(120).optional(),
  occurred_at: z.string().max(40).optional(),
};

export const proposeFactInputSchema = {
  claim: z.string().min(8).max(500),
  evidence: z.string().min(8).max(2_000),
  source_agent: z.string().min(1).max(60),
  repo: z.string().max(120).optional(),
  session_id: z.string().max(120).optional(),
  confidence: z.number().min(0).max(1).optional(),
};

export type ProposeResult = {
  accepted: boolean;
  reason: string;
  proposalId?: string;
  canon: false;
  note: string;
};

export function sanitizeAgentName(raw: string): string {
  const cleaned = raw.replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
  return cleaned || 'unknown_agent';
}

type ProposalKind = 'event' | 'durable_fact';

async function enqueuePendingProposal(
  ctx: McpAuthContext,
  toolName: 'propose_chronicle' | 'propose_fact',
  params: {
    claimText: string;
    sourceExcerpt: string;
    sourceAgent: string;
    kind: ProposalKind;
    confidence: number;
    repo?: string;
    sessionId?: string;
    occurredAt?: string;
  },
): Promise<ProposeResult> {
  const started = Date.now();
  const denied = (reason: string, note: string): ProposeResult => {
    void auditMcpToolCall({
      ctx,
      toolName,
      input: { source_agent: params.sourceAgent, kind: params.kind },
      status: 'denied',
      latencyMs: Date.now() - started,
      errorCode: reason,
    });
    return { accepted: false, reason, canon: false, note };
  };

  if (!canProposeMemory(ctx)) {
    return denied(
      'insufficient_scope',
      'This token cannot propose lore. Mint a hivemind token (memory:read memory:propose) while signed in.',
    );
  }

  const { selfCharacterService } = await import('../services/selfCharacterService');
  const { supabaseAdmin } = await import('../services/supabaseClient');

  let entityId: string | null = null;
  try {
    const self = await selfCharacterService.ensureSelfCharacter(ctx.user.id);
    entityId = (self as { id?: string } | null)?.id ?? null;
  } catch (err) {
    logger.warn({ err, userId: ctx.user.id }, 'propose: ensureSelfCharacter failed');
  }
  if (!entityId) {
    return denied('no_self_entity', 'No self entity on this account yet. Open LoreBook once, then retry.');
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('memory_proposals')
    .select('id')
    .eq('user_id', ctx.user.id)
    .eq('status', 'PENDING')
    .eq('claim_text', params.claimText)
    .limit(1)
    .maybeSingle();

  if (!existingError && existing?.id) {
    void auditMcpToolCall({
      ctx,
      toolName,
      input: { source_agent: params.sourceAgent, kind: params.kind },
      status: 'ok',
      latencyMs: Date.now() - started,
      outputArtifactIds: [existing.id as string],
    });
    return {
      accepted: true,
      reason: 'already_pending',
      proposalId: existing.id as string,
      canon: false,
      note: 'An identical proposal is already waiting in Memory Review. It is not canon.',
    };
  }

  const { data, error } = await supabaseAdmin
    .from('memory_proposals')
    .insert({
      user_id: ctx.user.id,
      entity_id: entityId,
      claim_text: params.claimText,
      confidence: params.confidence,
      source_excerpt: params.sourceExcerpt.slice(0, 500),
      reasoning: `Agent ${params.sourceAgent} proposed this for review. Not canon.`,
      affected_claim_ids: [],
      risk_level: 'HIGH',
      status: 'PENDING',
      metadata: {
        proposal_kind: params.kind,
        source: 'external_agent',
        source_agent: params.sourceAgent,
        client_id: ctx.clientId,
        repo: params.repo ?? null,
        session_id: params.sessionId ?? null,
        occurred_at: params.occurredAt ?? null,
        force_review: true,
        requires_confirmation: true,
        auto_approve: false,
      },
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    void auditMcpToolCall({
      ctx,
      toolName,
      input: { source_agent: params.sourceAgent, kind: params.kind },
      status: 'error',
      latencyMs: Date.now() - started,
      errorCode: 'persist_failed',
    });
    logger.warn({ err: error, userId: ctx.user.id, toolName }, 'propose: memory_proposals insert failed');
    return {
      accepted: false,
      reason: 'persist_failed',
      canon: false,
      note: 'Could not queue the proposal. Nothing was written to canon.',
    };
  }

  void auditMcpToolCall({
    ctx,
    toolName,
    input: { source_agent: params.sourceAgent, kind: params.kind },
    status: 'ok',
    latencyMs: Date.now() - started,
    outputArtifactIds: [data.id as string],
  });

  return {
    accepted: true,
    reason: 'queued',
    proposalId: data.id as string,
    canon: false,
    note: 'Queued in Memory Review. It is not canon until you accept it in LoreBook.',
  };
}

export async function mcpProposeChronicle(
  ctx: McpAuthContext,
  args: {
    summary: string;
    source_agent: string;
    repo?: string;
    session_id?: string;
    occurred_at?: string;
  },
): Promise<ProposeResult> {
  const sourceAgent = sanitizeAgentName(args.source_agent);
  const summary = args.summary.trim();
  return enqueuePendingProposal(ctx, 'propose_chronicle', {
    claimText: summary,
    sourceExcerpt: summary,
    sourceAgent,
    kind: 'event',
    confidence: 0.45,
    repo: args.repo,
    sessionId: args.session_id,
    occurredAt: args.occurred_at,
  });
}

export async function mcpProposeFact(
  ctx: McpAuthContext,
  args: {
    claim: string;
    evidence: string;
    source_agent: string;
    repo?: string;
    session_id?: string;
    confidence?: number;
  },
): Promise<ProposeResult> {
  const sourceAgent = sanitizeAgentName(args.source_agent);
  const claim = args.claim.trim();
  return enqueuePendingProposal(ctx, 'propose_fact', {
    claimText: claim,
    sourceExcerpt: args.evidence.trim(),
    sourceAgent,
    kind: 'durable_fact',
    confidence: args.confidence ?? 0.5,
    repo: args.repo,
    sessionId: args.session_id,
  });
}
