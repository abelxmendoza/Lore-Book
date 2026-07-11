import { describe, it, expect } from 'vitest';
import {
  canTransition,
  assertTransition,
  classifyIngestionError,
  computeRetryDelayMs,
  normalizeJobStatus,
  toWireStatus,
} from '../../../src/services/ingestion/ingestionJobStates';
import {
  buildDurabilityPayload,
  durabilityUserMessage,
  ChatDurabilityError,
  isChatDurabilityError,
} from '../../../src/services/chat/chatDurability';

describe('ingestion job state machine', () => {
  it('allows QUEUED → PROCESSING → COMPLETED', () => {
    expect(canTransition('QUEUED', 'PROCESSING')).toBe(true);
    expect(canTransition('PROCESSING', 'COMPLETED')).toBe(true);
    expect(canTransition('COMPLETED', 'QUEUED')).toBe(false);
  });

  it('allows PROCESSING → RETRYABLE_FAILED → QUEUED', () => {
    expect(canTransition('PROCESSING', 'RETRYABLE_FAILED')).toBe(true);
    expect(canTransition('RETRYABLE_FAILED', 'QUEUED')).toBe(true);
  });

  it('rejects invalid transitions via assertTransition', () => {
    expect(() => assertTransition('COMPLETED', 'PROCESSING')).toThrow(/Invalid/);
  });

  it('normalizes legacy wire statuses', () => {
    expect(normalizeJobStatus('pending')).toBe('QUEUED');
    expect(normalizeJobStatus('processing')).toBe('PROCESSING');
    expect(normalizeJobStatus('dead')).toBe('PERMANENT_FAILED');
    expect(normalizeJobStatus('QUEUED')).toBe('QUEUED');
  });

  it('maps logical status to wire values', () => {
    expect(toWireStatus('QUEUED')).toBe('pending');
    expect(toWireStatus('PROCESSING')).toBe('processing');
    expect(toWireStatus('PERMANENT_FAILED')).toBe('dead');
    expect(toWireStatus('RETRYABLE_FAILED')).toBe('pending');
  });
});

describe('classifyIngestionError', () => {
  it('classifies 429 as rate_limit retryable', () => {
    const c = classifyIngestionError({ status: 429, message: 'Rate limit exceeded' });
    expect(c.category).toBe('rate_limit');
    expect(c.retryable).toBe(true);
  });

  it('classifies quota exhaustion separately', () => {
    const c = classifyIngestionError({ message: 'insufficient_quota: You exceeded your current quota' });
    expect(c.category).toBe('quota_exhausted');
    expect(c.retryable).toBe(true);
  });

  it('classifies validation as non-retryable', () => {
    const c = classifyIngestionError(new Error('zod validation failed'));
    expect(c.category).toBe('validation');
    expect(c.retryable).toBe(false);
  });

  it('classifies ontology conflicts as non-retryable', () => {
    const c = classifyIngestionError(new Error('ontology conflict: unknown type'));
    expect(c.category).toBe('ontology_conflict');
    expect(c.retryable).toBe(false);
  });
});

describe('computeRetryDelayMs', () => {
  it('returns larger delays for quota vs rate limit on same attempt', () => {
    // Jittered — check ranges by sampling
    const quotaSamples = Array.from({ length: 20 }, () => computeRetryDelayMs(2, 'quota_exhausted'));
    const rateSamples = Array.from({ length: 20 }, () => computeRetryDelayMs(2, 'rate_limit'));
    const maxQuota = Math.max(...quotaSamples);
    const maxRate = Math.max(...rateSamples);
    expect(maxQuota).toBeGreaterThan(maxRate);
  });

  it('honors Retry-After style hint', () => {
    const d = computeRetryDelayMs(1, 'rate_limit', 12_000);
    expect(d).toBeGreaterThanOrEqual(12_000);
    expect(d).toBeLessThan(13_000);
  });
});

describe('chat durability payload + messaging', () => {
  it('builds truth-backed payload when message saved and job queued', () => {
    const d = buildDurabilityPayload({
      userMessageId: 'msg-1',
      sessionId: 's-1',
      assistantStatus: 'failed',
      assistantErrorCategory: 'rate_limit',
      ingestionJobId: 'job-1',
      ingestionStatus: 'QUEUED',
    });
    expect(d.userMessage.persisted).toBe(true);
    expect(d.assistantResponse.status).toBe('failed');
    expect(d.ingestion.status).toBe('QUEUED');
    expect(d.ingestion.jobId).toBe('job-1');
  });

  it('does not claim memory unknown when saved+queued', () => {
    const d = buildDurabilityPayload({
      userMessageId: 'msg-1',
      assistantStatus: 'failed',
      ingestionJobId: 'job-1',
      ingestionStatus: 'QUEUED',
    });
    const text = durabilityUserMessage(d, true);
    expect(text).toMatch(/saved/i);
    expect(text).toMatch(/queued|processing|autobiographical/i);
    expect(text.toLowerCase()).not.toContain('may not have completed');
  });

  it('ChatDurabilityError is detectable and carries durability', () => {
    const d = buildDurabilityPayload({
      userMessageId: 'msg-1',
      assistantStatus: 'failed',
      ingestionJobId: 'job-1',
      ingestionStatus: 'QUEUED',
    });
    const err = new ChatDurabilityError({
      message: '429 rate limit',
      category: 'rate_limit',
      durability: d,
    });
    expect(isChatDurabilityError(err)).toBe(true);
    expect(err.httpStatus).toBe(429);
    expect(err.durability.userMessage.persisted).toBe(true);
  });
});

describe('Anime Expo fixture regression (status contract)', () => {
  const FIXTURE =
    'I went to the club last night after Anime Expo. There was a BassRiot afterparty at Catch One. I danced with Mothdoll and Vexadoll. One of their friends pulled away, so I backed off and respected her boundary. The situation with Jenna taught me to respect boundaries. Earlier that day I visited Anime Expo and stopped by my tía’s house for food.';

  it('429 after persist produces saved+queued durability (not unknown memory)', () => {
    expect(FIXTURE.length).toBeGreaterThan(100);
    const d = buildDurabilityPayload({
      userMessageId: 'fixture-msg-1',
      sessionId: 'fixture-thread',
      idempotencyKey: 'client-key-1',
      assistantStatus: 'failed',
      assistantErrorCategory: 'rate_limit',
      ingestionJobId: 'fixture-job-1',
      ingestionStatus: 'QUEUED',
    });
    expect(d.userMessage.persisted).toBe(true);
    expect(d.userMessage.id).toBe('fixture-msg-1');
    expect(d.ingestion.jobId).toBe('fixture-job-1');
    expect(d.assistantResponse.status).toBe('failed');
    const userFacing = durabilityUserMessage(d, true);
    expect(userFacing).not.toMatch(/may not have completed/i);
    expect(userFacing).not.toMatch(/did not create or update memories/i);
  });
});
