import { describe, it, expect } from 'vitest';
import {
  INGESTION_PAYLOAD_REJECTION,
  INGESTION_SCHEMA_VERSION,
  adaptLegacyConversationPayload,
  buildConversationIngestionEnvelope,
  parseIngestionJobEnvelope,
  ingestionJobEnvelopeSchema,
} from './envelope';
import { isInvalidPersonName, isIncompleteRelationshipText } from './semanticGuards';

const base = {
  schemaVersion: INGESTION_SCHEMA_VERSION,
  userId: '11111111-1111-1111-1111-111111111111',
  sourceMessageId: 'msg-1',
  sourceThreadId: 'thread-1',
  createdAt: '2026-07-12T00:00:00.000Z',
  idempotencyKey: 'msg-1',
};

describe('ingestion job envelopes', () => {
  it('accepts conversation_ingestion built by helper', () => {
    const env = buildConversationIngestionEnvelope({
      userId: base.userId,
      sourceMessageId: 'msg-1',
      sourceThreadId: 'thread-1',
      idempotencyKey: 'msg-1',
      conversationHistory: [{ role: 'user', content: 'I went to the show with Maya' }],
    });
    const r = parseIngestionJobEnvelope(env);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.envelope.jobType).toBe('conversation_ingestion');
  });

  it('accepts atomic memory_proposal', () => {
    const env = {
      ...base,
      jobType: 'memory_proposal',
      payload: {
        proposalKind: 'occupation',
        subjectEntityId: 'char-self',
        predicate: 'works_as',
        typedValue: 'robotics technician',
        confidence: 0.82,
        risk: 'MEDIUM',
        sensitivity: 'NORMAL',
        evidenceIds: ['ev-1'],
        temporalScope: { kind: 'ONGOING' },
        proposedMutation: 'Add works_as robotics technician',
      },
    };
    expect(parseIngestionJobEnvelope(env).ok).toBe(true);
  });

  it('rejects memory_proposal without object or value', () => {
    const env = {
      ...base,
      jobType: 'memory_proposal',
      payload: {
        proposalKind: 'durable_fact',
        subjectEntityId: 'char-self',
        predicate: 'has_fact',
        confidence: 0.5,
        risk: 'LOW',
        sensitivity: 'NORMAL',
        evidenceIds: ['ev-1'],
        temporalScope: { kind: 'UNKNOWN' },
        proposedMutation: 'Add fact',
      },
    };
    const r = parseIngestionJobEnvelope(env);
    expect(r.ok).toBe(false);
  });

  it('rejects incomplete relationship (real failure style)', () => {
    const env = {
      ...base,
      jobType: 'relationship_candidate',
      payload: {
        subjectEntityId: 'u1',
        objectEntityId: 'u1', // same endpoint
        relationshipType: 'coworker',
        description: 'User has a coworker relationship.',
        confidence: 0.4,
        evidenceIds: ['ev-1'],
        temporalStatus: 'active',
      },
    };
    const r = parseIngestionJobEnvelope(env);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.reason === INGESTION_PAYLOAD_REJECTION.INCOMPLETE_RELATIONSHIP ||
          r.reason === INGESTION_PAYLOAD_REJECTION.STRUCTURAL_INVALID,
      ).toBe(true);
    }
    expect(isIncompleteRelationshipText('User has a coworker relationship.')).toBe(true);
  });

  it('rejects entity candidate "tonight" as PERSON', () => {
    expect(isInvalidPersonName('tonight').invalid).toBe(true);
    const env = {
      ...base,
      jobType: 'entity_candidate',
      payload: {
        name: 'tonight',
        entityType: 'PERSON',
        confidence: 0.9,
        evidenceIds: ['ev-1'],
      },
    };
    const r = parseIngestionJobEnvelope(env);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(INGESTION_PAYLOAD_REJECTION.INVALID_ENTITY_NAME);
  });

  it('rejects commands/questions as PERSON entities', () => {
    const env = {
      ...base,
      jobType: 'entity_candidate',
      payload: {
        name: 'Can you list my friends?',
        entityType: 'PERSON',
        confidence: 0.5,
        evidenceIds: ['ev-1'],
      },
    };
    expect(parseIngestionJobEnvelope(env).ok).toBe(false);
  });

  it('rejects raw_conversation_capture as event_candidate', () => {
    const env = {
      ...base,
      jobType: 'event_candidate',
      payload: {
        title: 'Chat message dump',
        occurredAt: '2026-07-12T00:00:00.000Z',
        recordedAt: '2026-07-12T00:00:00.000Z',
        temporalPrecision: 'unknown',
        temporalSource: 'message_timestamp',
        eligibilityReason: 'raw_conversation_capture',
        confidence: 0.2,
        evidenceIds: ['msg-1'],
      },
    };
    const r = parseIngestionJobEnvelope(env);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(INGESTION_PAYLOAD_REJECTION.EVENT_NOT_ELIGIBLE);
  });

  it('accepts dated event with distinct occurredAt/recordedAt', () => {
    const env = {
      ...base,
      jobType: 'event_candidate',
      payload: {
        title: 'Went to Anime Expo with friends',
        occurredAt: '2025-07-04T00:00:00.000Z',
        recordedAt: '2026-07-12T00:00:00.000Z',
        temporalPrecision: 'day',
        temporalSource: 'explicit_in_text',
        eligibilityReason: 'dated_experience',
        confidence: 0.8,
        evidenceIds: ['ev-1'],
        participantEntityIds: ['char-maya'],
      },
    };
    expect(parseIngestionJobEnvelope(env).ok).toBe(true);
  });

  it('requires correction provenance when targets empty', () => {
    const env = {
      ...base,
      jobType: 'correction_mutation',
      payload: {
        targetClaimIds: [],
        replacementClaim: 'I work as a technician',
        correctionAuthority: 'user_explicit',
        provenance: {},
        supersessionBehavior: 'replace_claims',
      },
    };
    expect(parseIngestionJobEnvelope(env).ok).toBe(false);
  });

  it('accepts correction with targets', () => {
    const env = {
      ...base,
      jobType: 'correction_mutation',
      payload: {
        targetClaimIds: ['claim-1'],
        replacementClaim: 'I work as a robotics technician',
        correctionAuthority: 'user_explicit',
        provenance: { sourceMessageId: 'msg-1', evidenceIds: ['ev-1'] },
        supersessionBehavior: 'replace_claims',
      },
    };
    expect(parseIngestionJobEnvelope(env).ok).toBe(true);
  });

  it('accepts retraction with targets', () => {
    const env = {
      ...base,
      jobType: 'retraction_mutation',
      payload: {
        targetClaimIds: ['claim-old'],
        retractionAuthority: 'user_explicit',
        provenance: { note: 'user said this is wrong' },
        reason: 'User corrected: never worked there',
      },
    };
    expect(parseIngestionJobEnvelope(env).ok).toBe(true);
  });

  it('does not silently coerce unknown unversioned payloads', () => {
    const r = parseIngestionJobEnvelope({ foo: 'bar', entities: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(INGESTION_PAYLOAD_REJECTION.LEGACY_UNVERSIONED);
  });

  it('explicitly adapts legacy conversation payloads with context', () => {
    const r = adaptLegacyConversationPayload(
      { conversationHistory: [{ role: 'user', content: 'hi' }], force: false },
      {
        userId: base.userId,
        sourceMessageId: 'msg-legacy',
        sourceThreadId: 't1',
        idempotencyKey: 'msg-legacy',
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.legacyAdapted).toBe(true);
      expect(r.envelope.jobType).toBe('conversation_ingestion');
    }
  });

  it('rejects unknown schemaVersion without adapting', () => {
    const r = parseIngestionJobEnvelope({ ...base, schemaVersion: 99, jobType: 'conversation_ingestion', payload: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(INGESTION_PAYLOAD_REJECTION.UNKNOWN_SCHEMA_VERSION);
  });

  it('discriminatedUnion rejects wrong payload for jobType', () => {
    const bad = {
      ...base,
      jobType: 'entity_candidate',
      payload: { conversationHistory: [] },
    };
    expect(ingestionJobEnvelopeSchema.safeParse(bad).success).toBe(false);
  });
});
