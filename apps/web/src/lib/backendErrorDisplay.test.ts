import { describe, expect, it } from 'vitest';
import {
  compactBackendStatusMessage,
  isBackendConnectionError,
  sanitizeInlineError,
} from './backendErrorDisplay';

describe('backendErrorDisplay', () => {
  it('detects backend connection errors', () => {
    expect(isBackendConnectionError('Backend server is not running')).toBe(true);
    expect(isBackendConnectionError('Failed to fetch')).toBe(true);
    expect(isBackendConnectionError('Invalid session')).toBe(false);
  });

  it('uses compact mobile copy', () => {
    expect(compactBackendStatusMessage({ isMobile: true, usingMock: true })).toBe('Offline · sample data');
  });

  it('suppresses inline backend noise when requested', () => {
    expect(
      sanitizeInlineError('Failed to fetch', { suppressBackendNoise: true })
    ).toBeNull();
    expect(
      sanitizeInlineError('Rename failed', { suppressBackendNoise: true })
    ).toBe('Rename failed');
  });
});
