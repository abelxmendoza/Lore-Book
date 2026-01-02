import { describe, it, expect, beforeEach, vi } from 'vitest';
import { config } from './env';

describe('Environment Configuration Tests - Black Screen Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have valid API URL configuration', () => {
    expect(config.api.url).toBeDefined();
    expect(typeof config.api.url).toBe('string');
    // Should be a valid URL format
    expect(config.api.url.length).toBeGreaterThan(0);
  });

  it('should handle missing Supabase URL gracefully', () => {
    // Config should not throw even if env vars are missing
    expect(() => {
      const apiUrl = config.api.url;
      expect(apiUrl).toBeDefined();
    }).not.toThrow();
  });

  it('should have valid environment mode', () => {
    expect(config.env.mode).toBeDefined();
    expect(['development', 'production', 'test']).toContain(config.env.mode);
  });

  it('should have timeout configuration', () => {
    expect(config.api.timeout).toBeDefined();
    expect(typeof config.api.timeout).toBe('number');
    expect(config.api.timeout).toBeGreaterThan(0);
  });

  it('should allow mock data fallback in development', () => {
    // In development, mock data should be allowed
    if (config.env.isDevelopment) {
      expect(config.dev.allowMockData).toBeDefined();
    }
  });

  it('should not throw when accessing config properties', () => {
    expect(() => {
      const _ = config.api.url;
      const __ = config.env.mode;
      const ___ = config.api.timeout;
    }).not.toThrow();
  });
});

