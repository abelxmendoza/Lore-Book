import { z } from 'zod';
import {
  INGESTION_PAYLOAD_REJECTION,
  INGESTION_SCHEMA_VERSION,
  ingestionJobTypeSchema,
  type IngestionJobType,
  type IngestionPayloadRejectionReason,
} from './common';

// Re-export for single-import convenience
export {
  INGESTION_PAYLOAD_REJECTION,
  INGESTION_SCHEMA_VERSION,
  ingestionJobTypeSchema,
};
import {
  consolidationJobPayloadSchema,
  conversationIngestionPayloadSchema,
  correctionMutationPayloadSchema,
  entityCandidatePayloadSchema,
  eventCandidatePayloadSchema,
  memoryProposalPayloadSchema,
  relationshipCandidatePayloadSchema,
  retractionMutationPayloadSchema,
} from './jobPayloads';

/**
 * Discriminated union of versioned job envelopes.
 * Every durable ingestion_jobs.payload MUST parse as one of these (schemaVersion >= 1).
 */

const envelopeBase = {
  schemaVersion: z.literal(INGESTION_SCHEMA_VERSION),
  userId: z.string().uuid().or(z.string().min(1)),
  sourceMessageId: z.string().min(1),
  sourceThreadId: z.string().min(1).optional().nullable(),
  createdAt: z.string().min(1),
  idempotencyKey: z.string().min(1),
};

export const conversationIngestionEnvelopeSchema = z.object({
  ...envelopeBase,
  jobType: z.literal('conversation_ingestion'),
  payload: conversationIngestionPayloadSchema,
});

export const memoryProposalEnvelopeSchema = z.object({
  ...envelopeBase,
  jobType: z.literal('memory_proposal'),
  payload: memoryProposalPayloadSchema,
});

export const entityCandidateEnvelopeSchema = z.object({
  ...envelopeBase,
  jobType: z.literal('entity_candidate'),
  payload: entityCandidatePayloadSchema,
});

export const relationshipCandidateEnvelopeSchema = z.object({
  ...envelopeBase,
  jobType: z.literal('relationship_candidate'),
  payload: relationshipCandidatePayloadSchema,
});

export const eventCandidateEnvelopeSchema = z.object({
  ...envelopeBase,
  jobType: z.literal('event_candidate'),
  payload: eventCandidatePayloadSchema,
});

export const correctionMutationEnvelopeSchema = z.object({
  ...envelopeBase,
  jobType: z.literal('correction_mutation'),
  payload: correctionMutationPayloadSchema,
});

export const retractionMutationEnvelopeSchema = z.object({
  ...envelopeBase,
  jobType: z.literal('retraction_mutation'),
  payload: retractionMutationPayloadSchema,
});

export const consolidationJobEnvelopeSchema = z.object({
  ...envelopeBase,
  jobType: z.literal('consolidation_job'),
  payload: consolidationJobPayloadSchema,
});

export const ingestionJobEnvelopeSchema = z.discriminatedUnion('jobType', [
  conversationIngestionEnvelopeSchema,
  memoryProposalEnvelopeSchema,
  entityCandidateEnvelopeSchema,
  relationshipCandidateEnvelopeSchema,
  eventCandidateEnvelopeSchema,
  correctionMutationEnvelopeSchema,
  retractionMutationEnvelopeSchema,
  consolidationJobEnvelopeSchema,
]);

export type IngestionJobEnvelope = z.infer<typeof ingestionJobEnvelopeSchema>;

export type IngestionParseSuccess = {
  ok: true;
  envelope: IngestionJobEnvelope;
  /** True when a known legacy conversation payload was adapted (not silent). */
  legacyAdapted?: boolean;
};

export type IngestionParseFailure = {
  ok: false;
  reason: IngestionPayloadRejectionReason;
  message: string;
  diagnostics: {
    schemaVersion?: unknown;
    jobType?: unknown;
    zodIssues?: z.ZodIssue[];
    rawKeys?: string[];
  };
};

export type IngestionParseResult = IngestionParseSuccess | IngestionParseFailure;

/**
 * Known pre-envelope conversation payload shape.
 * Explicit compatibility only — never invents entity/relationship/event records.
 */
export function isLegacyConversationPayload(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  if ('schemaVersion' in o || 'jobType' in o) return false;
  const keys = Object.keys(o);
  if (keys.length === 0) return true; // empty force-only
  const allowed = new Set(['conversationHistory', 'force']);
  if (!keys.every((k) => allowed.has(k))) return false;
  if (o.conversationHistory !== undefined && !Array.isArray(o.conversationHistory)) return false;
  return true;
}

export type LegacyAdaptContext = {
  userId: string;
  sourceMessageId: string;
  sourceThreadId?: string | null;
  idempotencyKey: string;
  createdAt?: string;
};

/**
 * Explicit legacy → conversation_ingestion adapter.
 * Callers must log/metric `legacyAdapted` — never treat as a silent upgrade.
 */
export function adaptLegacyConversationPayload(
  raw: unknown,
  ctx: LegacyAdaptContext,
): IngestionParseResult {
  if (!isLegacyConversationPayload(raw)) {
    return {
      ok: false,
      reason: INGESTION_PAYLOAD_REJECTION.LEGACY_UNVERSIONED,
      message: 'Payload is unversioned and not a recognized legacy conversation shape',
      diagnostics: {
        rawKeys: raw && typeof raw === 'object' ? Object.keys(raw as object) : [],
      },
    };
  }
  const o = (raw && typeof raw === 'object' ? raw : {}) as {
    conversationHistory?: Array<{ role: string; content: string }>;
    force?: boolean;
  };
  const envelope = {
    schemaVersion: INGESTION_SCHEMA_VERSION,
    jobType: 'conversation_ingestion' as const,
    userId: ctx.userId,
    sourceMessageId: ctx.sourceMessageId,
    sourceThreadId: ctx.sourceThreadId ?? null,
    createdAt: ctx.createdAt ?? new Date().toISOString(),
    idempotencyKey: ctx.idempotencyKey,
    payload: {
      conversationHistory: o.conversationHistory?.map((m) => ({
        role: (m.role === 'assistant' || m.role === 'system' ? m.role : 'user') as
          | 'user'
          | 'assistant'
          | 'system',
        content: typeof m.content === 'string' ? m.content.slice(0, 8000) : '',
      })),
      force: o.force,
    },
  };
  const parsed = conversationIngestionEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) {
    return {
      ok: false,
      reason: INGESTION_PAYLOAD_REJECTION.STRUCTURAL_INVALID,
      message: 'Legacy conversation payload failed structural validation after adapt',
      diagnostics: { zodIssues: parsed.error.issues },
    };
  }
  return { ok: true, envelope: parsed.data, legacyAdapted: true };
}

/** Validate a durable payload at write or read boundary. */
export function parseIngestionJobEnvelope(
  raw: unknown,
  legacyCtx?: LegacyAdaptContext,
): IngestionParseResult {
  if (raw == null || typeof raw !== 'object') {
    return {
      ok: false,
      reason: INGESTION_PAYLOAD_REJECTION.MISSING_ENVELOPE,
      message: 'Payload is null or not an object',
      diagnostics: {},
    };
  }
  const o = raw as Record<string, unknown>;

  if (!('schemaVersion' in o)) {
    if (legacyCtx) return adaptLegacyConversationPayload(raw, legacyCtx);
    return {
      ok: false,
      reason: INGESTION_PAYLOAD_REJECTION.LEGACY_UNVERSIONED,
      message: 'Missing schemaVersion; refuse silent coercion without explicit legacy context',
      diagnostics: { rawKeys: Object.keys(o) },
    };
  }

  if (o.schemaVersion !== INGESTION_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: INGESTION_PAYLOAD_REJECTION.UNKNOWN_SCHEMA_VERSION,
      message: `Unsupported schemaVersion: ${String(o.schemaVersion)}`,
      diagnostics: { schemaVersion: o.schemaVersion, jobType: o.jobType },
    };
  }

  if (typeof o.jobType === 'string') {
    const jt = ingestionJobTypeSchema.safeParse(o.jobType);
    if (!jt.success) {
      return {
        ok: false,
        reason: INGESTION_PAYLOAD_REJECTION.UNKNOWN_JOB_TYPE,
        message: `Unknown jobType: ${o.jobType}`,
        diagnostics: { jobType: o.jobType },
      };
    }
  }

  const parsed = ingestionJobEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    // Classify semantic vs structural from issue messages
    const msgs = parsed.error.issues.map((i) => i.message).join('; ');
    let reason: IngestionPayloadRejectionReason = INGESTION_PAYLOAD_REJECTION.STRUCTURAL_INVALID;
    if (/incomplete relationship|endpoints must be distinct|relationshipType must be specific/i.test(msgs)) {
      reason = INGESTION_PAYLOAD_REJECTION.INCOMPLETE_RELATIONSHIP;
    } else if (/entity name rejected|forbidden_pattern/i.test(msgs)) {
      reason = INGESTION_PAYLOAD_REJECTION.INVALID_ENTITY_NAME;
    } else if (/eligibilityReason|not a valid event/i.test(msgs)) {
      reason = INGESTION_PAYLOAD_REJECTION.EVENT_NOT_ELIGIBLE;
    } else if (/targetClaimIds|corrections without/i.test(msgs)) {
      reason = INGESTION_PAYLOAD_REJECTION.CORRECTION_INCOMPLETE;
    } else if (/semantic|rejected/i.test(msgs)) {
      reason = INGESTION_PAYLOAD_REJECTION.SEMANTIC_INVALID;
    }
    return {
      ok: false,
      reason,
      message: msgs || 'Envelope failed validation',
      diagnostics: {
        schemaVersion: o.schemaVersion,
        jobType: o.jobType,
        zodIssues: parsed.error.issues,
        rawKeys: Object.keys(o),
      },
    };
  }

  return { ok: true, envelope: parsed.data };
}

/** Build a V1 conversation_ingestion envelope for producers. */
export function buildConversationIngestionEnvelope(input: {
  userId: string;
  sourceMessageId: string;
  sourceThreadId?: string | null;
  idempotencyKey: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  force?: boolean;
  createdAt?: string;
}): IngestionJobEnvelope {
  return {
    schemaVersion: INGESTION_SCHEMA_VERSION,
    jobType: 'conversation_ingestion',
    userId: input.userId,
    sourceMessageId: input.sourceMessageId,
    sourceThreadId: input.sourceThreadId ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    idempotencyKey: input.idempotencyKey,
    payload: {
      conversationHistory: input.conversationHistory?.map((m) => ({
        role: m.role,
        content: m.content.slice(0, 8000),
      })),
      force: input.force,
    },
  };
}

export function assertJobType(envelope: IngestionJobEnvelope, expected: IngestionJobType): void {
  if (envelope.jobType !== expected) {
    throw new Error(`Expected jobType ${expected}, got ${envelope.jobType}`);
  }
}
