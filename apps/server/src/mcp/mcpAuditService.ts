import { createHash } from 'node:crypto';

import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';

import type { McpAuditStatus, McpAuthContext } from './types';
import { MCP_TOOL_VERSION } from './types';

function hashInput(input: unknown): string {
  const canonical = JSON.stringify(input ?? {});
  return createHash('sha256').update(canonical).digest('hex');
}

export async function auditMcpToolCall(params: {
  ctx: McpAuthContext;
  toolName: string;
  input: unknown;
  status: McpAuditStatus;
  latencyMs: number;
  outputArtifactIds?: string[];
  errorCode?: string;
}): Promise<void> {
  const row = {
    user_id: params.ctx.user.id,
    client_id: params.ctx.clientId,
    tool_name: params.toolName,
    tool_version: MCP_TOOL_VERSION,
    request_id: params.ctx.requestId,
    input_hash: hashInput(params.input),
    output_artifact_ids: params.outputArtifactIds ?? [],
    status: params.status,
    error_code: params.errorCode ?? null,
    latency_ms: params.latencyMs,
    ip_hash: params.ctx.ipHash ?? null,
  };

  const { error } = await supabaseAdmin.from('mcp_tool_audit_log').insert(row);
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === 'PGRST205' || code === '42P01') {
      logger.debug({ toolName: params.toolName }, 'MCP audit log table missing — skipping');
      return;
    }
    logger.warn({ error, toolName: params.toolName }, 'Failed to write MCP audit log');
  }
}

export { hashInput as hashMcpInput };
