/**
 * Hivemind over MCP — lets every coding agent the user connects (Claude Code,
 * Codex, Cursor, Antigravity, ChatGPT, ...) share one cloud workspace:
 * per-project "where I left off" checkpoints, durable agent memories, and a
 * milestone ledger.
 *
 * Two gates, both required:
 *  1. Account: ctx.features.hivemind, resolved server-side from the account's
 *     role / grant (lib/hivemindAccess.ts) before the server is built.
 *  2. Token: hivemind:read for read tools, hivemind:write for write tools.
 *
 * Tools failing either gate are not registered (absent from tools/list), and
 * each handler re-checks defensively, mirroring the lore write tools.
 */

import { z } from 'zod';

import {
  addMilestone,
  containsLikelySecret,
  listCheckpoints,
  listMemories,
  listMilestones,
  upsertCheckpoint,
  upsertMemory,
} from '../services/hivemind/hivemindService';

import { auditMcpToolCall } from './mcpAuditService';
import { insufficientScopeMessage, missingScopes } from './mcpScopes';
import type { McpAuthContext } from './types';

export const HIVEMIND_TOOL_NAMES = [
  'hivemind_where_i_left_off',
  'hivemind_recall',
  'hivemind_milestones',
  'hivemind_checkpoint',
  'hivemind_record_memory',
  'hivemind_log_milestone',
] as const;

export type HivemindToolName = (typeof HIVEMIND_TOOL_NAMES)[number];

export const hivemindInputSchemas = {
  hivemind_where_i_left_off: {
    project: z.string().max(120).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  hivemind_recall: {
    query: z.string().max(200).optional(),
    project: z.string().max(120).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  },
  hivemind_milestones: {
    limit: z.number().int().min(1).max(100).optional(),
  },
  hivemind_checkpoint: {
    project: z.string().min(1).max(120),
    agent: z.string().min(1).max(60),
    where_left_off: z.string().min(1).max(4000),
    next_steps: z.array(z.string().min(1).max(500)).max(20).optional(),
  },
  hivemind_record_memory: {
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(20_000),
    project: z.string().min(1).max(120).optional(),
    agent: z.string().min(1).max(60).optional(),
  },
  hivemind_log_milestone: {
    track: z.string().min(1).max(120),
    project: z.string().min(1).max(120),
    highlight: z.string().min(1).max(2000),
    agent: z.string().min(1).max(60).optional(),
    /** ISO date-time the milestone shipped; defaults to now. */
    occurred_at: z.string().datetime({ offset: true }).optional(),
  },
} as const;

export const hivemindToolDescriptions: Record<HivemindToolName, string> = {
  hivemind_where_i_left_off:
    "Hivemind: get the user's live 'where I left off' board — the latest checkpoint per project, written by any of their AI agents. Call at the start of a coding session to pick up where another agent stopped.",
  hivemind_recall:
    'Hivemind: search durable cross-agent memories (decisions, conventions, gotchas) the user or their agents saved. Optional project filter.',
  hivemind_milestones:
    "Hivemind: list the user's shipped engineering milestones, newest first.",
  hivemind_checkpoint:
    'Hivemind: record where you left off on a project and the next steps, so the next agent (or device) can continue. Replaces the previous checkpoint for that project. Use at the end of a work session or a meaningful milestone.',
  hivemind_record_memory:
    'Hivemind: save a durable memory every agent should know (a decision, convention, setup gotcha). Saving again with the same title updates it. Never store secrets, tokens, or credentials.',
  hivemind_log_milestone:
    'Hivemind: log a shipped engineering milestone (e.g. a feature merged) to the user ledger. Only for work that actually shipped.',
};

const READ_TOOLS = new Set<HivemindToolName>([
  'hivemind_where_i_left_off',
  'hivemind_recall',
  'hivemind_milestones',
]);

export function isHivemindReadTool(name: HivemindToolName): boolean {
  return READ_TOOLS.has(name);
}

/** Both gates: account feature + token scopes. */
export function canUseHivemindTool(ctx: McpAuthContext, name: HivemindToolName): boolean {
  return ctx.features?.hivemind === true && missingScopes(ctx, name).length === 0;
}

type Denied = { ok: false; reason: string; note: string };

/** Hivemind text is shared with every connected agent — refuse obvious secrets. */
export { containsLikelySecret };

async function guard(
  ctx: McpAuthContext,
  name: HivemindToolName,
  auditInput: unknown,
  started: number,
): Promise<Denied | null> {
  if (ctx.features?.hivemind !== true) {
    void auditMcpToolCall({ ctx, toolName: name, input: auditInput, status: 'denied', latencyMs: Date.now() - started, errorCode: 'hivemind_not_enabled' });
    return { ok: false, reason: 'hivemind_not_enabled', note: 'Hivemind is not enabled for this account.' };
  }
  const missing = missingScopes(ctx, name);
  if (missing.length > 0) {
    void auditMcpToolCall({ ctx, toolName: name, input: auditInput, status: 'denied', latencyMs: Date.now() - started, errorCode: 'insufficient_scope' });
    return { ok: false, reason: 'insufficient_scope', note: insufficientScopeMessage(name, missing) };
  }
  return null;
}

export async function runHivemindTool(
  ctx: McpAuthContext,
  name: HivemindToolName,
  args: Record<string, unknown>,
): Promise<unknown> {
  const started = Date.now();
  // Audit hashes metadata only, never memory/checkpoint text.
  const auditInput = { tool: name, keys: Object.keys(args).sort() };
  const denied = await guard(ctx, name, auditInput, started);
  if (denied) return denied;

  const userId = ctx.user.id;
  try {
    let data: unknown;
    switch (name) {
      case 'hivemind_where_i_left_off': {
        const rows = await listCheckpoints(userId, (args.limit as number | undefined) ?? 50);
        const project = (args.project as string | undefined)?.toLowerCase();
        data = project ? rows.filter((r) => r.project.toLowerCase() === project) : rows;
        break;
      }
      case 'hivemind_recall':
        data = await listMemories(userId, {
          query: args.query as string | undefined,
          project: args.project as string | undefined,
          limit: (args.limit as number | undefined) ?? 10,
        });
        break;
      case 'hivemind_milestones':
        data = await listMilestones(userId, (args.limit as number | undefined) ?? 25);
        break;
      case 'hivemind_checkpoint': {
        const a = args as { project: string; agent: string; where_left_off: string; next_steps?: string[] };
        if (containsLikelySecret(a.where_left_off, ...(a.next_steps ?? []))) return secretRejected(ctx, name, auditInput, started);
        data = await upsertCheckpoint(userId, a);
        break;
      }
      case 'hivemind_record_memory': {
        const a = args as { title: string; content: string; project?: string; agent?: string };
        if (containsLikelySecret(a.title, a.content)) return secretRejected(ctx, name, auditInput, started);
        data = await upsertMemory(userId, a);
        break;
      }
      case 'hivemind_log_milestone': {
        const a = args as { track: string; project: string; highlight: string; agent?: string; occurred_at?: string };
        if (containsLikelySecret(a.highlight)) return secretRejected(ctx, name, auditInput, started);
        data = await addMilestone(userId, a);
        break;
      }
    }
    void auditMcpToolCall({ ctx, toolName: name, input: auditInput, status: 'ok', latencyMs: Date.now() - started });
    return { ok: true, data, request_id: ctx.requestId };
  } catch {
    void auditMcpToolCall({ ctx, toolName: name, input: auditInput, status: 'error', latencyMs: Date.now() - started, errorCode: 'hivemind_store_failed' });
    return { ok: false, reason: 'hivemind_store_failed', note: 'Hivemind storage failed — try again.' };
  }
}

function secretRejected(ctx: McpAuthContext, name: HivemindToolName, auditInput: unknown, started: number): Denied {
  void auditMcpToolCall({ ctx, toolName: name, input: auditInput, status: 'denied', latencyMs: Date.now() - started, errorCode: 'secret_detected' });
  return {
    ok: false,
    reason: 'secret_detected',
    note: 'This looks like it contains a secret (API key, token, or private key). Hivemind is shared with every connected agent — remove the secret and try again.',
  };
}
