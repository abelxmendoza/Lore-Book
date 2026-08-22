import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Sentry from '@sentry/node';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));

vi.mock('../src/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

describe('server monitoring', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.SENTRY_DSN;
    delete process.env.NODE_ENV;
    delete process.env.VITEST;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does not initialize Sentry without a DSN', async () => {
    const { initErrorTracking } = await import('../src/lib/monitoring');
    initErrorTracking();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('does not initialize Sentry in the test environment even with a DSN set', async () => {
    process.env.SENTRY_DSN = 'https://key@example.ingest.sentry.io/1';
    process.env.VITEST = 'true';
    const { initErrorTracking } = await import('../src/lib/monitoring');
    initErrorTracking();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initializes Sentry when a DSN is present outside test/dev', async () => {
    process.env.SENTRY_DSN = 'https://key@example.ingest.sentry.io/1';
    process.env.VITEST = 'false';
    process.env.NODE_ENV = 'production';
    const { initErrorTracking } = await import('../src/lib/monitoring');
    initErrorTracking();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://key@example.ingest.sentry.io/1',
        sendDefaultPii: false,
      }),
    );
  });

  it('errorTracking helpers no-op before initialization', async () => {
    const { errorTracking } = await import('../src/lib/monitoring');
    errorTracking.captureException(new Error('boom'));
    errorTracking.captureMessage('hello');
    errorTracking.setUser({ id: 'u1' });
    errorTracking.addBreadcrumb({ message: 'bc' });
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(Sentry.setUser).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('errorTracking.captureException forwards to Sentry once initialized', async () => {
    process.env.SENTRY_DSN = 'https://key@example.ingest.sentry.io/1';
    process.env.VITEST = 'false';
    process.env.NODE_ENV = 'production';
    const { initErrorTracking, errorTracking } = await import('../src/lib/monitoring');
    initErrorTracking();

    const err = new Error('boom');
    errorTracking.captureException(err, { path: '/api/chat' });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ contexts: { custom: { path: '/api/chat' } } }),
    );
  });

  it('drops EPIPE/ECONNRESET errors via beforeSend instead of reporting them', async () => {
    process.env.SENTRY_DSN = 'https://key@example.ingest.sentry.io/1';
    process.env.VITEST = 'false';
    process.env.NODE_ENV = 'production';
    const { initErrorTracking } = await import('../src/lib/monitoring');
    initErrorTracking();

    const initCall = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const epipeErr = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    const result = initCall.beforeSend({ message: 'x' }, { originalException: epipeErr });
    expect(result).toBeNull();

    const otherErr = new Error('something else');
    const kept = initCall.beforeSend({ message: 'y' }, { originalException: otherErr });
    expect(kept).toEqual({ message: 'y' });
  });

  it('flush resolves true without initialization (nothing to flush)', async () => {
    const { errorTracking } = await import('../src/lib/monitoring');
    await expect(errorTracking.flush()).resolves.toBe(true);
    expect(Sentry.flush).not.toHaveBeenCalled();
  });

  it('flush calls through to Sentry.flush once initialized', async () => {
    process.env.SENTRY_DSN = 'https://key@example.ingest.sentry.io/1';
    process.env.VITEST = 'false';
    process.env.NODE_ENV = 'production';
    const { initErrorTracking, errorTracking } = await import('../src/lib/monitoring');
    initErrorTracking();
    await errorTracking.flush(1500);
    expect(Sentry.flush).toHaveBeenCalledWith(1500);
  });
});
