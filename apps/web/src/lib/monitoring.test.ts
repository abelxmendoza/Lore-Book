import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';
import { initErrorTracking, initAnalytics, errorTracking, analytics, performance } from './monitoring';

// Mock dependencies
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  browserTracingIntegration: vi.fn(),
  replayIntegration: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    identify: vi.fn(),
    capture: vi.fn(),
    reset: vi.fn(),
    __loaded: true,
  },
}));

vi.mock('../config/env', () => ({
  config: {
    env: {
      isDevelopment: false,
      isProduction: true,
      mode: 'production',
    },
    prod: {
      enableErrorReporting: true,
      enableAnalytics: true,
    },
    dev: {
      enableConsoleLogs: false,
    },
  },
}));

describe('Monitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    import.meta.env.VITE_SENTRY_DSN = 'test-dsn';
    import.meta.env.VITE_POSTHOG_API_KEY = 'test-key';
  });

  describe('initErrorTracking', () => {
    it('initializes Sentry when DSN is provided', () => {
      initErrorTracking();
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'test-dsn',
          environment: 'production',
        })
      );
    });

    it('does not initialize when DSN is missing', () => {
      import.meta.env.VITE_SENTRY_DSN = '';
      initErrorTracking();
      expect(Sentry.init).not.toHaveBeenCalled();
    });
  });

  describe('initAnalytics', () => {
    it('initializes PostHog when API key is provided', () => {
      initAnalytics();
      expect(posthog.init).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({
          api_host: expect.any(String),
        })
      );
    });

    it('does not initialize when API key is missing', () => {
      import.meta.env.VITE_POSTHOG_API_KEY = '';
      initAnalytics();
      expect(posthog.init).not.toHaveBeenCalled();
    });
  });

  describe('errorTracking', () => {
    it('captures exceptions', () => {
      const error = new Error('Test error');
      errorTracking.captureException(error, { context: 'test' });

      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        contexts: {
          custom: { context: 'test' },
        },
      });
    });

    it('captures messages', () => {
      errorTracking.captureMessage('Test message', 'warning', { data: 'value' });

      expect(Sentry.captureMessage).toHaveBeenCalledWith('Test message', {
        level: 'warning',
        contexts: {
          custom: { data: 'value' },
        },
      });
    });

    it('sets user context', () => {
      errorTracking.setUser({ id: '123', email: 'test@example.com' });

      expect(Sentry.setUser).toHaveBeenCalledWith({
        id: '123',
        email: 'test@example.com',
        username: undefined,
      });
    });

    it('clears user context', () => {
      errorTracking.clearUser();
      expect(Sentry.setUser).toHaveBeenCalledWith(null);
    });

    it('adds breadcrumbs', () => {
      errorTracking.addBreadcrumb({
        message: 'User action',
        category: 'user',
        level: 'info',
      });

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        message: 'User action',
        category: 'user',
        level: 'info',
        data: undefined,
      });
    });
  });

  describe('analytics', () => {
    it('identifies users', () => {
      analytics.identify('user-123', { email: 'test@example.com' });
      expect(posthog.identify).toHaveBeenCalledWith('user-123', {
        email: 'test@example.com',
      });
    });

    it('tracks events', () => {
      analytics.track('button_clicked', { button: 'submit' });
      expect(posthog.capture).toHaveBeenCalledWith('button_clicked', {
        button: 'submit',
      });
    });

    it('tracks pageviews', () => {
      analytics.page('Dashboard', { section: 'overview' });
      expect(posthog.capture).toHaveBeenCalledWith('$pageview', {
        page_name: 'Dashboard',
        section: 'overview',
      });
    });

    it('resets session', () => {
      analytics.reset();
      expect(posthog.reset).toHaveBeenCalled();
    });
  });

  describe('performance', () => {
    it('marks performance entries', () => {
      const markSpy = vi.spyOn(global.performance, 'mark').mockImplementation(() => {});
      performance.mark('test-mark');
      expect(markSpy).toHaveBeenCalledWith('test-mark');
      markSpy.mockRestore();
    });

    it('measures performance', () => {
      const measureSpy = vi.spyOn(global.performance, 'measure').mockImplementation(() => {
        return { duration: 100 } as PerformanceMeasure;
      });
      const getEntriesSpy = vi.spyOn(global.performance, 'getEntriesByName').mockReturnValue([
        { duration: 100 } as PerformanceEntry,
      ] as PerformanceEntry[]);

      performance.mark('start');
      performance.mark('end');
      const result = performance.measure('test-measure', 'start', 'end');

      expect(measureSpy).toHaveBeenCalled();
      expect(result).toBeDefined();
      measureSpy.mockRestore();
      getEntriesSpy.mockRestore();
    });

    it('tracks API calls', () => {
      // Mock isPostHogLoaded to return true
      vi.spyOn(analytics as any, 'isPostHogLoaded').mockReturnValue(true);
      const trackSpy = vi.spyOn(analytics, 'track');
      
      performance.trackApiCall('/api/test', 150, true);

      expect(trackSpy).toHaveBeenCalledWith('api_call', {
        endpoint: '/api/test',
        duration: 150,
        success: true,
      });
      
      trackSpy.mockRestore();
    });
  });
});

