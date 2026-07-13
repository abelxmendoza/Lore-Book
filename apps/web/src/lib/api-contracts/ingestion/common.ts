import { z } from 'zod';

/** Current envelope version — bump only with an explicit adapter. */
export const INGESTION_SCHEMA_VERSION = 1 as const;

export const ingestionJobTypeSchema = z.enum([
  'conversation_ingestion',
  'memory_proposal',
  'entity_candidate',
  'relationship_candidate',
  'event_candidate',
  'correction_mutation',
  'retraction_mutation',
  'consolidation_job',
]);

export type IngestionJobType = z.infer<typeof ingestionJobTypeSchema>;

export const temporalPrecisionSchema = z.enum([
  'exact',
  'day',
  'month',
  'year',
  'era',
  'unknown',
  'relative',
]);

export const temporalSourceSchema = z.enum([
  'explicit_in_text',
  'inferred_from_context',
  'message_timestamp',
  'user_asserted',
  'system_default',
  'unknown',
]);

export const temporalScopeSchema = z.object({
  kind: z.enum(['MOMENT', 'PERIOD', 'ONGOING', 'UNKNOWN']),
  startedAt: z.string().min(1).optional(),
  endedAt: z.string().min(1).optional(),
  label: z.string().max(200).optional(),
  precision: temporalPrecisionSchema.optional(),
  source: temporalSourceSchema.optional(),
});

export type TemporalScope = z.infer<typeof temporalScopeSchema>;

export const confidenceSchema = z.number().min(0).max(1);
export const riskSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const sensitivitySchema = z.enum(['NORMAL', 'PRIVATE', 'SENSITIVE']);

export const conversationTurnSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(8000),
});

/** Rejection reasons used in metrics + dead-letter diagnostics. */
export const INGESTION_PAYLOAD_REJECTION = {
  MISSING_ENVELOPE: 'missing_envelope',
  LEGACY_UNVERSIONED: 'legacy_unversioned',
  UNKNOWN_SCHEMA_VERSION: 'unknown_schema_version',
  UNKNOWN_JOB_TYPE: 'unknown_job_type',
  STRUCTURAL_INVALID: 'structural_invalid',
  SEMANTIC_INVALID: 'semantic_invalid',
  INCOMPLETE_RELATIONSHIP: 'incomplete_relationship',
  INVALID_ENTITY_TYPE: 'invalid_entity_type',
  INVALID_ENTITY_NAME: 'invalid_entity_name',
  EVENT_NOT_ELIGIBLE: 'event_not_eligible',
  CORRECTION_INCOMPLETE: 'correction_incomplete',
} as const;

export type IngestionPayloadRejectionReason =
  (typeof INGESTION_PAYLOAD_REJECTION)[keyof typeof INGESTION_PAYLOAD_REJECTION];
