/**
 * MCP lore ingestion — the write side of dev-session lore capture.
 *
 * A development agent (Claude Code, Codex, Grok, …) that hears the user's life
 * story mid-session can push it into LoreBook's full ingestion pipeline. The
 * narrative guard keeps code, specs, and bug reports OUT of the lore: only
 * autobiographical narrative gets stored, with dev-session provenance, and the
 * existing resolve-before-write machinery dedupes what LoreBook already knows.
 */

import { z } from 'zod';

import { auditMcpToolCall } from './mcpAuditService';
import type { McpAuthContext } from './types';

export const ingestStoryInputSchema = {
  story: z.string().min(20).max(20_000),
  /** Which agent/tool is sending this (e.g. "claude_code", "codex", "grok"). */
  source_tool: z.string().max(60).optional(),
  /** ISO date the story happened, when the agent knows it. */
  occurred_at: z.string().optional(),
  _version: z.string().optional(),
};

const CODE_SIGNAL_RE =
  /```|\bfunction\b|\bconst \w+ =|=>|\bimport .+ from\b|\bnpm (run|install)\b|\bgit (commit|push|merge)\b|\bSELECT .+ FROM\b|\bCREATE TABLE\b|\berror TS\d+|\bstack ?trace\b|\bendpoint\b|\bAPI\b|\brefactor\b|\bmigration\b|\btest(s)? (pass|fail)/i;

const FIRST_PERSON_RE = /\b(i|i'm|i've|me|my|we|our)\b/gi;

export type NarrativeAssessment = {
  isNarrative: boolean;
  reason: 'narrative' | 'technical_content' | 'no_first_person' | 'too_short';
};

/**
 * Pure guard: does this text read as autobiographical narrative rather than
 * development chatter? Conservative — rejecting a borderline story is safer
 * than polluting lore with stack traces.
 */
export function assessNarrative(text: string): NarrativeAssessment {
  const trimmed = text.trim();
  if (trimmed.length < 20) return { isNarrative: false, reason: 'too_short' };

  const words = trimmed.split(/\s+/).length;
  const firstPerson = (trimmed.match(FIRST_PERSON_RE) ?? []).length;
  if (firstPerson === 0) return { isNarrative: false, reason: 'no_first_person' };

  // Technical signals outweigh a thin first-person presence ("I fixed the bug").
  const codeSignals = (trimmed.match(new RegExp(CODE_SIGNAL_RE.source, 'gi')) ?? []).length;
  if (codeSignals > 0 && firstPerson / Math.max(1, words / 25) < codeSignals) {
    return { isNarrative: false, reason: 'technical_content' };
  }

  return { isNarrative: true, reason: 'narrative' };
}

export type IngestStoryResult = {
  accepted: boolean;
  reason: string;
  messageId?: string | null;
  note?: string;
};

export async function mcpIngestStory(
  ctx: McpAuthContext,
  args: { story: string; source_tool?: string; occurred_at?: string },
): Promise<IngestStoryResult> {
  const started = Date.now();
  const sourceTool = (args.source_tool ?? 'unknown_agent').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);

  const assessment = assessNarrative(args.story);
  if (!assessment.isNarrative) {
    void auditMcpToolCall({
      ctx,
      toolName: 'ingest_story',
      input: { source_tool: sourceTool, story_chars: args.story.length },
      status: 'denied',
      latencyMs: Date.now() - started,
      errorCode: assessment.reason,
    });
    return {
      accepted: false,
      reason: assessment.reason,
      note:
        'Only autobiographical narrative is stored as lore. Send the life story itself, without code or technical discussion.',
    };
  }

  const { omegaChatService } = await import('../services/omegaChatService');
  const story = args.occurred_at ? `${args.story}\n\n(This happened on ${args.occurred_at}.)` : args.story;
  const messageId = await omegaChatService.ingestStandaloneText(ctx.user.id, story, {
    source: `dev_session:${sourceTool}`,
  });

  void auditMcpToolCall({
    ctx,
    toolName: 'ingest_story',
    input: { source_tool: sourceTool, story_chars: args.story.length },
    status: messageId ? 'ok' : 'error',
    latencyMs: Date.now() - started,
    outputArtifactIds: messageId ? [messageId] : undefined,
    errorCode: messageId ? undefined : 'persist_failed',
  });

  if (!messageId) {
    return { accepted: false, reason: 'persist_failed', note: 'Storage failed — try again.' };
  }
  return {
    accepted: true,
    reason: 'stored',
    messageId,
    note: 'Story queued through the full lore ingestion pipeline (entities, relationships, events, provenance). Duplicates of known lore are resolved, not re-created.',
  };
}
