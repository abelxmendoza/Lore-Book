import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUnwrap } = vi.hoisted(() => ({
  mockUnwrap: vi.fn(),
}));

vi.mock('../../src/lib/openai', () => ({
  openai: {
    webhooks: {
      unwrap: mockUnwrap,
    },
  },
}));

vi.mock('../../src/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../../src/services/openaiPlatform/openaiBackgroundResponses', () => ({
  handleBackgroundResponseWebhook: vi.fn().mockResolvedValue(undefined),
}));

import { config } from '../../src/config';
import { handleOpenAiWebhook } from '../../src/routes/openaiWebhooks';

function mockRes() {
  const res: {
    statusCode: number;
    body?: unknown;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
  } = {
    statusCode: 200,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

describe('handleOpenAiWebhook', () => {
  beforeEach(() => {
    config.openAiWebhookSecret = 'whsec_test';
    mockUnwrap.mockReset();
  });

  it('returns 503 when webhook secret is not configured', async () => {
    config.openAiWebhookSecret = undefined;
    const res = mockRes();
    await handleOpenAiWebhook(
      { body: Buffer.from('{}'), headers: {} } as never,
      res as never,
    );
    expect(res.statusCode).toBe(503);
  });

  it('returns 400 when signature verification fails', async () => {
    mockUnwrap.mockImplementationOnce(() => {
      throw new Error('bad signature');
    });

    const res = mockRes();
    await handleOpenAiWebhook(
      { body: Buffer.from('{}'), headers: {} } as never,
      res as never,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid webhook signature' });
  });

  it('accepts verified webhook events', async () => {
    mockUnwrap.mockReturnValueOnce({ type: 'response.completed', data: { id: 'resp_1' } });

    const res = mockRes();
    await handleOpenAiWebhook(
      { body: Buffer.from('{}'), headers: { 'webhook-id': 'evt_1' } } as never,
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
