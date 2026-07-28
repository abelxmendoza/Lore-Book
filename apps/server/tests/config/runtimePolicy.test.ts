import { describe, expect, it } from 'vitest';

import {
  isDevelopmentRuntime,
  isProductionRuntime,
  shouldBlockAnonymousAiChat,
} from '../../src/config/runtimePolicy';

describe('runtimePolicy', () => {
  it('treats NODE_ENV=development as development', () => {
    expect(isDevelopmentRuntime({ NODE_ENV: 'development' })).toBe(true);
  });

  it('treats API_ENV=dev as development when NODE_ENV is not production', () => {
    expect(isDevelopmentRuntime({ API_ENV: 'dev' })).toBe(true);
    expect(isDevelopmentRuntime({ API_ENV: 'dev', NODE_ENV: 'test' })).toBe(true);
  });

  it('does not treat API_ENV=dev as development when NODE_ENV=production', () => {
    expect(isDevelopmentRuntime({ API_ENV: 'dev', NODE_ENV: 'production' })).toBe(false);
    expect(isProductionRuntime({ API_ENV: 'dev', NODE_ENV: 'production' })).toBe(true);
  });

  it('lets production and hosted markers override conflicting development flags', () => {
    expect(isDevelopmentRuntime({ NODE_ENV: 'development', API_ENV: 'production' })).toBe(false);
    expect(isDevelopmentRuntime({ API_ENV: 'dev', RAILWAY_ENVIRONMENT: 'production' })).toBe(false);
    expect(isProductionRuntime({ NODE_ENV: 'development', RAILWAY_ENVIRONMENT: 'production' })).toBe(true);
    expect(isProductionRuntime({ API_ENV: 'dev', VERCEL: '1' })).toBe(true);
  });

  it('treats hosted non-dev runtime as production', () => {
    expect(isProductionRuntime({ RAILWAY_ENVIRONMENT: 'production' })).toBe(true);
    expect(isProductionRuntime({ NODE_ENV: 'production' })).toBe(true);
    expect(isProductionRuntime({ API_ENV: 'production' })).toBe(true);
  });

  it('does not block anonymous AI chat in development', () => {
    expect(shouldBlockAnonymousAiChat(undefined, { NODE_ENV: 'development' })).toBe(false);
  });

  it('blocks anonymous AI chat in production', () => {
    expect(shouldBlockAnonymousAiChat(undefined, { NODE_ENV: 'production' })).toBe(true);
  });

  it('allows authenticated AI chat in production', () => {
    expect(
      shouldBlockAnonymousAiChat({ id: 'user-1' }, { NODE_ENV: 'production' }),
    ).toBe(false);
  });
});
