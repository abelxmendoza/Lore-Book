/**
 * Boundary gate: validate ingestion_jobs.payload before write and on worker read.
 */

import {
  buildConversationIngestionEnvelope,
  parseIngestionJobEnvelope,
  type IngestionJobEnvelope,
  type IngestionParseResult,
} from '@lorebook/api-contracts';
import { logger } from '../../logger';
import {
  recordPayloadDeadLetterInvalid,
  recordPayloadRejected,
  recordPayloadValidated,
} from './ingestionPayloadMetrics';

export type PayloadGateOk = {
  ok: true;
  envelope: IngestionJobEnvelope;
  /** Serializable payload to store in jsonb */
  durablePayload: IngestionJobEnvelope;
  legacyAdapted?: boolean;
};

export type PayloadGateFail = {
  ok: false;
  reason: string;
  message: string;
  diagnostics: Record<string, unknown>;
};

export type PayloadGateResult = PayloadGateOk | PayloadGateFail;

/** Validate at producer / persist boundary. */
export function gateIngestionPayloadForWrite(
  raw: unknown,
  ctx: {
    userId: string;
    sourceMessageId: string;
    sourceThreadId?: string | null;
    idempotencyKey: string;
  },
): PayloadGateResult {
  // If already a full envelope, parse strictly (no silent legacy).
  if (raw && typeof raw === 'object' && 'schemaVersion' in (raw as object)) {
    return fromParse(parseIngestionJobEnvelope(raw), 'write');
  }

  // Producers should pass envelopes; accept legacy only when building conversation jobs.
  const parse = parseIngestionJobEnvelope(raw, {
    userId: ctx.userId,
    sourceMessageId: ctx.sourceMessageId,
    sourceThreadId: ctx.sourceThreadId,
    idempotencyKey: ctx.idempotencyKey,
  });
  return fromParse(parse, 'write');
}

/** Build + validate conversation envelope (chat path). */
export function gateConversationIngestionWrite(input: {
  userId: string;
  chatMessageId: string;
  sessionId: string;
  idempotencyKey: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  force?: boolean;
}): PayloadGateResult {
  const envelope = buildConversationIngestionEnvelope({
    userId: input.userId,
    sourceMessageId: input.chatMessageId,
    sourceThreadId: input.sessionId || null,
    idempotencyKey: input.idempotencyKey,
    conversationHistory: input.conversationHistory,
    force: input.force,
  });
  return fromParse(parseIngestionJobEnvelope(envelope), 'write');
}

/** Validate at worker / recover boundary. */
export function gateIngestionPayloadForRead(
  raw: unknown,
  ctx: {
    userId: string;
    sourceMessageId: string;
    sourceThreadId?: string | null;
    idempotencyKey: string;
    jobId?: string;
  },
): PayloadGateResult {
  const parse = parseIngestionJobEnvelope(raw, {
    userId: ctx.userId,
    sourceMessageId: ctx.sourceMessageId || ctx.idempotencyKey,
    sourceThreadId: ctx.sourceThreadId,
    idempotencyKey: ctx.idempotencyKey,
  });
  const result = fromParse(parse, 'read');
  if (!result.ok) {
    logger.warn(
      {
        jobId: ctx.jobId,
        userId: ctx.userId,
        reason: result.reason,
        diagnostics: result.diagnostics,
      },
      'ingestion payload gate rejected job on read — quarantine',
    );
  }
  return result;
}

function fromParse(parse: IngestionParseResult, boundary: 'write' | 'read'): PayloadGateResult {
  if (!parse.ok) {
    recordPayloadRejected(parse.reason);
    return {
      ok: false,
      reason: parse.reason,
      message: parse.message,
      diagnostics: parse.diagnostics as Record<string, unknown>,
    };
  }
  recordPayloadValidated({
    jobType: parse.envelope.jobType,
    schemaVersion: parse.envelope.schemaVersion,
    legacyAdapted: parse.legacyAdapted,
  });
  if (parse.legacyAdapted) {
    logger.info(
      {
        jobType: parse.envelope.jobType,
        boundary,
        userId: parse.envelope.userId,
        sourceMessageId: parse.envelope.sourceMessageId,
      },
      'ingestion payload: explicit legacy conversation adapt (not silent)',
    );
  }
  return {
    ok: true,
    envelope: parse.envelope,
    durablePayload: parse.envelope,
    legacyAdapted: parse.legacyAdapted,
  };
}

export function recordInvalidPayloadDeadLetter(reason: string): void {
  recordPayloadDeadLetterInvalid(reason);
}
