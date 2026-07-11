import { describe, it, expect } from 'vitest';
import {
  buildDurabilityApiResponse,
  assertValidDurabilityResponse,
} from '../../../src/services/chat/durabilityApiContract';
import { buildDurabilityPayload } from '../../../src/services/chat/chatDurability';

describe('durability API contract', () => {
  it('never overloads userMessage as a display string', () => {
    const payload = buildDurabilityPayload({
      userMessageId: 'msg-1',
      sessionId: 's1',
      assistantStatus: 'failed',
      assistantErrorCategory: 'rate_limit',
      ingestionJobId: 'job-1',
      ingestionStatus: 'QUEUED',
    });
    const body = buildDurabilityApiResponse(payload, {
      assistantFailed: true,
      code: 'rate_limit',
      stage: 'response_generation',
    });

    expect(typeof body.userMessage).toBe('object');
    expect(body.userMessage.persisted).toBe(true);
    expect(typeof body.notice.message).toBe('string');
    expect(body.notice.message.length).toBeGreaterThan(10);
    expect(assertValidDurabilityResponse(body)).toBe(true);
  });

  it('rejects legacy shape with userMessage as string', () => {
    expect(
      assertValidDurabilityResponse({
        userMessage: 'I saved your message...',
        assistantResponse: { status: 'failed' },
        ingestion: { status: 'QUEUED' },
        notice: { code: 'x', message: 'y' },
      }),
    ).toBe(false);
  });

  it('RECOVERY_REQUIRED does not claim ingestion_started', () => {
    const payload = buildDurabilityPayload({
      userMessageId: 'msg-1',
      assistantStatus: 'pending',
      ingestionStatus: 'RECOVERY_REQUIRED',
    });
    payload.ingestion.recoveryRequired = true;
    const body = buildDurabilityApiResponse(payload);
    expect(body.memory?.user_message_saved).toBe(true);
    expect(body.memory?.ingestion_started).toBe(false);
    expect(body.notice.message).toMatch(/recovery|could not queue/i);
  });

  it('JSON serialization has unique top-level keys for userMessage', () => {
    const payload = buildDurabilityPayload({
      userMessageId: 'msg-1',
      assistantStatus: 'failed',
      ingestionJobId: 'j1',
      ingestionStatus: 'QUEUED',
    });
    const body = buildDurabilityApiResponse(payload, { assistantFailed: true });
    const parsed = JSON.parse(JSON.stringify(body));
    expect(parsed.userMessage.id).toBe('msg-1');
    expect(parsed.notice.message).toBeDefined();
    expect(typeof parsed.userMessage).toBe('object');
  });
});
