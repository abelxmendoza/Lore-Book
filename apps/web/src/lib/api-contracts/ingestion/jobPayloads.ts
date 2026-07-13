import { z } from 'zod';
import {
  confidenceSchema,
  conversationTurnSchema,
  riskSchema,
  sensitivitySchema,
  temporalPrecisionSchema,
  temporalScopeSchema,
  temporalSourceSchema,
} from './common';
import {
  ALLOWED_ENTITY_TYPES,
  entityTypeBlocksName,
  isIncompleteRelationshipText,
} from './semanticGuards';

// ─── conversation_ingestion ─────────────────────────────────────────────────

export const conversationIngestionPayloadSchema = z.object({
  conversationHistory: z.array(conversationTurnSchema).max(100).optional(),
  force: z.boolean().optional(),
});

// ─── memory_proposal ────────────────────────────────────────────────────────

export const proposalKindSchema = z.enum([
  'durable_fact',
  'identity_fact',
  'occupation',
  'relationship',
  'event',
  'plan',
  'preference',
  'emotional_state',
  'entity_classification',
  'correction',
  'retraction',
]);

export const memoryProposalPayloadSchema = z
  .object({
    proposalKind: proposalKindSchema,
    subjectEntityId: z.string().min(1),
    predicate: z.string().min(1).max(120),
    objectEntityId: z.string().min(1).optional(),
    typedValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    confidence: confidenceSchema,
    risk: riskSchema,
    sensitivity: sensitivitySchema,
    evidenceIds: z.array(z.string().min(1)).min(1),
    temporalScope: temporalScopeSchema,
    proposedMutation: z.string().min(1).max(2000),
    claimText: z.string().min(1).max(2000).optional(),
    reasoning: z.string().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.objectEntityId == null && val.typedValue === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'memory_proposal requires objectEntityId or typedValue',
        path: ['objectEntityId'],
      });
    }
    if (val.proposalKind === 'relationship' && !val.objectEntityId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'relationship proposals require objectEntityId',
        path: ['objectEntityId'],
      });
    }
  });

// ─── entity_candidate ───────────────────────────────────────────────────────

export const entityCandidatePayloadSchema = z
  .object({
    name: z.string().min(1).max(120),
    entityType: z.enum(ALLOWED_ENTITY_TYPES),
    aliases: z.array(z.string().max(120)).max(20).optional(),
    confidence: confidenceSchema,
    evidenceIds: z.array(z.string().min(1)).min(1),
    surfaceForm: z.string().max(200).optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((val, ctx) => {
    const block = entityTypeBlocksName(val.entityType, val.name);
    if (block) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `entity name rejected for type ${val.entityType}: ${block}`,
        path: ['name'],
      });
    }
  });

// ─── relationship_candidate ─────────────────────────────────────────────────

export const relationshipCandidatePayloadSchema = z
  .object({
    subjectEntityId: z.string().min(1),
    objectEntityId: z.string().min(1),
    relationshipType: z.string().min(1).max(80),
    /** Free-text description must still name endpoints / type concretely. */
    description: z.string().max(500).optional(),
    confidence: confidenceSchema,
    evidenceIds: z.array(z.string().min(1)).min(1),
    temporalStatus: z.enum(['active', 'ended', 'uncertain', 'planned']),
    temporalScope: temporalScopeSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.subjectEntityId === val.objectEntityId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'relationship endpoints must be distinct',
        path: ['objectEntityId'],
      });
    }
    if (val.description && isIncompleteRelationshipText(val.description)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'incomplete relationship description (needs two resolved endpoints in evidence)',
        path: ['description'],
      });
    }
    // Reject vague types that encode no concrete relation
    if (/^(?:relationship|related|connection|link)$/i.test(val.relationshipType.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'relationshipType must be specific (not generic "relationship")',
        path: ['relationshipType'],
      });
    }
  });

// ─── event_candidate ────────────────────────────────────────────────────────

export const eventEligibilityReasonSchema = z.enum([
  'dated_experience',
  'anchored_occurrence',
  'user_asserted_event',
  // Explicit non-event reasons — using these fails eligibility refine
  'raw_conversation_capture',
  'audit_mutation',
  'system_internal',
]);

export const eventCandidatePayloadSchema = z
  .object({
    title: z.string().min(1).max(300),
    occurredAt: z.string().min(1),
    recordedAt: z.string().min(1),
    temporalPrecision: temporalPrecisionSchema,
    temporalSource: temporalSourceSchema,
    eligibilityReason: eventEligibilityReasonSchema,
    confidence: confidenceSchema,
    evidenceIds: z.array(z.string().min(1)).min(1),
    participantEntityIds: z.array(z.string().min(1)).optional(),
    locationEntityId: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    const blocked = new Set(['raw_conversation_capture', 'audit_mutation', 'system_internal']);
    if (blocked.has(val.eligibilityReason)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `eligibilityReason ${val.eligibilityReason} is not a valid event candidate`,
        path: ['eligibilityReason'],
      });
    }
    if (val.occurredAt === val.recordedAt && val.temporalSource === 'system_default') {
      // still allowed, but precision must not pretend exactness without source
      if (val.temporalPrecision === 'exact') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'exact precision requires non-system temporal source',
          path: ['temporalPrecision'],
        });
      }
    }
  });

// ─── correction / retraction ────────────────────────────────────────────────

export const correctionAuthoritySchema = z.enum([
  'user_explicit',
  'user_edit',
  'system_dedup',
  'admin',
  'governance',
]);

export const supersessionBehaviorSchema = z.enum([
  'replace_claims',
  'deprecate_claims',
  'annotate_only',
  'retract_only',
]);

export const correctionMutationPayloadSchema = z
  .object({
    targetClaimIds: z.array(z.string().min(1)).default([]),
    replacementClaim: z.string().min(1).max(2000),
    correctionAuthority: correctionAuthoritySchema,
    provenance: z.object({
      sourceMessageId: z.string().min(1).optional(),
      evidenceIds: z.array(z.string()).optional(),
      note: z.string().max(1000).optional(),
    }),
    supersessionBehavior: supersessionBehaviorSchema,
    confidence: confidenceSchema.optional(),
  })
  .superRefine((val, ctx) => {
    // If we claim replace/deprecate, need targets when resolvable — empty is only ok for annotate
    if (
      (val.supersessionBehavior === 'replace_claims' ||
        val.supersessionBehavior === 'deprecate_claims' ||
        val.supersessionBehavior === 'retract_only') &&
      val.targetClaimIds.length === 0
    ) {
      // Soft: allow but require provenance note explaining unresolved targets
      if (!val.provenance.note && !(val.provenance.evidenceIds && val.provenance.evidenceIds.length > 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'corrections without targetClaimIds require provenance.note or evidenceIds explaining unresolved targets',
          path: ['targetClaimIds'],
        });
      }
    }
  });

export const retractionMutationPayloadSchema = z.object({
  targetClaimIds: z.array(z.string().min(1)).min(1),
  retractionAuthority: correctionAuthoritySchema,
  provenance: z.object({
    sourceMessageId: z.string().min(1).optional(),
    evidenceIds: z.array(z.string()).optional(),
    note: z.string().max(1000).optional(),
  }),
  reason: z.string().min(1).max(1000),
});

// ─── consolidation_job ──────────────────────────────────────────────────────

export const consolidationJobPayloadSchema = z.object({
  domain: z.enum([
    'entities',
    'relationships',
    'events',
    'claims',
    'timeline',
    'cross_domain',
  ]),
  targetIds: z.array(z.string().min(1)).optional(),
  strategy: z.string().min(1).max(80),
  dryRun: z.boolean().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export type ConversationIngestionPayload = z.infer<typeof conversationIngestionPayloadSchema>;
export type MemoryProposalPayload = z.infer<typeof memoryProposalPayloadSchema>;
export type EntityCandidatePayload = z.infer<typeof entityCandidatePayloadSchema>;
export type RelationshipCandidatePayload = z.infer<typeof relationshipCandidatePayloadSchema>;
export type EventCandidatePayload = z.infer<typeof eventCandidatePayloadSchema>;
export type CorrectionMutationPayload = z.infer<typeof correctionMutationPayloadSchema>;
export type RetractionMutationPayload = z.infer<typeof retractionMutationPayloadSchema>;
export type ConsolidationJobPayload = z.infer<typeof consolidationJobPayloadSchema>;
