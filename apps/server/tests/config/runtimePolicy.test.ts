import { describe, expect, it } from 'vitest';

import {
  isDevelopmentRuntime,
  isProductionRuntime,
  shouldBlockAnonymousAiChat,
} from '../../src/config/runtimePolicy';

describe('runtimePolicy', () => {
  it('treats NODE_ENV=development and API_ENV=dev as development', () => {
    expect(isDevelopmentRuntime({ NODE_ENV: 'development' })).toBe(true);
    expect(isDevelopmentRuntime({ API_ENV: 'dev' })).toBe(true);
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
