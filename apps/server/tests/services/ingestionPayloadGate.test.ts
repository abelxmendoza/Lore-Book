import { describe, it, expect, beforeEach } from 'vitest';
import {
  gateConversationIngestionWrite,
  gateIngestionPayloadForRead,
} from '../../src/services/ingestion/ingestionPayloadGate';
import {
  getIngestionPayloadMetrics,
  resetIngestionPayloadMetricsForTests,
} from '../../src/services/ingestion/ingestionPayloadMetrics';
import { buildConversationIngestionEnvelope } from '@lorebook/api-contracts';

const userId = '22222222-2222-2222-2222-222222222222';

describe('ingestionPayloadGate', () => {
  beforeEach(() => {
    resetIngestionPayloadMetricsForTests();
  });

  it('accepts conversation write envelope and records metrics', () => {
    const r = gateConversationIngestionWrite({
      userId,
      chatMessageId: 'msg-a',
      sessionId: 'sess-a',
      idempotencyKey: 'msg-a',
      conversationHistory: [{ role: 'user', content: 'I started a new job' }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.durablePayload.schemaVersion).toBe(1);
      expect(r.durablePayload.jobType).toBe('conversation_ingestion');
    }
    const m = getIngestionPayloadMetrics();
    expect(m.validated_ok).toBeGreaterThanOrEqual(1);
    expect(m.by_job_type.conversation_ingestion).toBeGreaterThanOrEqual(1);
  });

  it('read path explicitly adapts legacy conversation payloads', () => {
    const r = gateIngestionPayloadForRead(
      { conversationHistory: [{ role: 'user', content: 'legacy' }], force: true },
      {
        userId,
        sourceMessageId: 'msg-legacy',
        sourceThreadId: 'sess',
        idempotencyKey: 'msg-legacy',
        jobId: 'job-1',
      },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.legacyAdapted).toBe(true);
      expect(r.envelope.jobType).toBe('conversation_ingestion');
    }
    expect(getIngestionPayloadMetrics().legacy_adapted).toBeGreaterThanOrEqual(1);
  });

  it('rejects incomplete relationship-style payload on read (no silent coerce)', () => {
    const r = gateIngestionPayloadForRead(
      {
        schemaVersion: 1,
        jobType: 'relationship_candidate',
        userId,
        sourceMessageId: 'm1',
        createdAt: new Date().toISOString(),
        idempotencyKey: 'm1',
        payload: {
          subjectEntityId: 'a',
          objectEntityId: 'a',
          relationshipType: 'relationship',
          description: 'User has a coworker relationship.',
          confidence: 0.3,
          evidenceIds: ['e1'],
          temporalStatus: 'active',
        },
      },
      {
        userId,
        sourceMessageId: 'm1',
        idempotencyKey: 'm1',
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/incomplete|structural|semantic|invalid/i);
    }
    expect(getIngestionPayloadMetrics().rejected).toBeGreaterThanOrEqual(1);
  });

  it('producer/consumer compatibility: write envelope re-parses on read', () => {
    const written = buildConversationIngestionEnvelope({
      userId,
      sourceMessageId: 'msg-pc',
      sourceThreadId: 'th',
      idempotencyKey: 'msg-pc',
      conversationHistory: [{ role: 'user', content: 'compatibility' }],
    });
    const w = gateConversationIngestionWrite({
      userId,
      chatMessageId: 'msg-pc',
      sessionId: 'th',
      idempotencyKey: 'msg-pc',
      conversationHistory: [{ role: 'user', content: 'compatibility' }],
    });
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    const read = gateIngestionPayloadForRead(w.durablePayload, {
      userId,
      sourceMessageId: 'msg-pc',
      sourceThreadId: 'th',
      idempotencyKey: 'msg-pc',
    });
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.envelope.sourceMessageId).toBe(written.sourceMessageId);
      expect(read.envelope.jobType).toBe('conversation_ingestion');
    }
  });
});
