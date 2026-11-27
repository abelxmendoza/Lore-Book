import { z } from 'zod';

import { supabaseAdmin } from '../services/supabaseClient';

import { auditMcpToolCall, hashMcpInput } from './mcpAuditService';
import { hasToolScopes } from './mcpScopes';
import type { McpAuthContext } from './types';

export const sessionSummaryInput = {
  agent: z.string().trim().min(1).max(60),
  source_ref: z.string().trim().min(1).max(500),
  summary: z.string().trim().min(20).max(8000),
};

const sessionSummarySchema = z.object(sessionSummaryInput);

export async function mcpSaveSessionSummary(
  ctx: McpAuthContext,
  args: z.infer<typeof sessionSummarySchema>,
) {
  const started = Date.now();
  if (!hasToolScopes(ctx, 'save_session_summary')) {
    return { accepted: false, reason: 'insufficient_scope' };
  }
  const payload = sessionSummarySchema.parse(args);
  const key = hashMcpInput([payload.agent, payload.source_ref, payload.summary]);
  const { error } = await supabaseAdmin.from('agent_session_summaries').upsert(
    { user_id: ctx.user.id, idempotency_key: key, ...payload },
    { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true },
  );
  await auditMcpToolCall({
    ctx,
    toolName: 'save_session_summary',
    input: { key },
    status: error ? 'error' : 'ok',
    latencyMs: Date.now() - started,
    errorCode: error?.code,
  });
  return error ? { accepted: false, reason: 'storage_failed' } : { accepted: true, id: key };
}

export async function mcpListSessionSummaries(ctx: McpAuthContext, limit: number) {
  if (!hasToolScopes(ctx, 'list_session_summaries')) {
    return { ok: false, reason: 'insufficient_scope' };
  }
  const { data, error } = await supabaseAdmin.from('agent_session_summaries')
    .select('idempotency_key,agent,source_ref,summary,created_at')
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false })
    .order('idempotency_key')
    .limit(limit);
  return error ? { ok: false, reason: 'storage_failed' } : { ok: true, summaries: data };
}
