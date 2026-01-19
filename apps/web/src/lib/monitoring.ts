/**
 * Monitoring Service
 * 
 * Centralized monitoring for errors, analytics, and performance.
 * Supports Sentry (error tracking) and PostHog (analytics).
 */

import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';
import { config } from '../config/env';

// Initialize Sentry for error tracking
export const initErrorTracking = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  
  if (!dsn || !config.prod.enableErrorReporting) {
    if (config.dev.enableConsoleLogs) {
      console.log('[Monitoring] Error tracking disabled (no DSN or disabled in config)');
    }
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: config.env.mode,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],
      // Performance Monitoring
      tracesSampleRate: config.env.isProduction ? 0.1 : 1.0, // 10% in prod, 100% in dev
      // Session Replay
      replaysSessionSampleRate: config.env.isProduction ? 0.1 : 1.0,
      replaysOnErrorSampleRate: 1.0, // Always capture replays on errors
      // Release tracking
      release: import.meta.env.VITE_APP_VERSION || 'unknown',
      // Filter out common non-actionable errors
      beforeSend(event, hint) {
        // Filter out network errors that are expected (e.g., backend not running in dev)
        if (config.dev.allowMockData && event.exception) {
          const error = hint.originalException;
          if (error instanceof TypeError && error.message.includes('fetch')) {
            return null; // Don't report fetch errors when using mock data
          }
        }
        return event;
      },
    });

    if (config.dev.enableConsoleLogs) {
      console.log('[Monitoring] Error tracking initialized');
    }
  } catch (error) {
    console.error('[Monitoring] Failed to initialize error tracking:', error);
  }
};

// Initialize PostHog for analytics
export const initAnalytics = () => {
  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
  const host = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

  if (!apiKey || !config.prod.enableAnalytics) {
    if (config.dev.enableConsoleLogs) {
      console.log('[Monitoring] Analytics disabled (no API key or disabled in config)');
    }
    return;
  }

  try {
    posthog.init(apiKey, {
      api_host: host,
      loaded: (posthog) => {
        if (config.dev.enableConsoleLogs) {
          console.log('[Monitoring] Analytics initialized');
        }
      },
      // Disable in development unless explicitly enabled
      disable_session_recording: config.env.isDevelopment && import.meta.env.VITE_ENABLE_SESSION_RECORDING !== 'true',
      // Capture pageviews automatically
      capture_pageview: true,
      // Capture pageleaves
      capture_pageleave: true,
    });
  } catch (error) {
    console.error('[Monitoring] Failed to initialize analytics:', error);
  }
};

// Error tracking helpers
export const errorTracking = {
  captureException: (error: Error, context?: Record<string, any>) => {
    if (config.prod.enableErrorReporting) {
      Sentry.captureException(error, {
        contexts: {
          custom: context || {},
        },
      });
    }
    // Always log to console in development
    if (config.dev.enableConsoleLogs) {
      console.error('[Error Tracking]', error, context);
    }
  },

  captureMessage: (message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, any>) => {
    if (config.prod.enableErrorReporting) {
      Sentry.captureMessage(message, {
        level: level === 'info' ? 'info' : level === 'warning' ? 'warning' : 'error',
        contexts: {
          custom: context || {},
        },
      });
    }
    if (config.dev.enableConsoleLogs) {
      console[level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log']('[Error Tracking]', message, context);
    }
  },

  setUser: (user: { id: string; email?: string; username?: string }) => {
    if (config.prod.enableErrorReporting) {
      Sentry.setUser({
        id: user.id,
        email: user.email,
        username: user.username,
      });
    }
  },

  clearUser: () => {
    if (config.prod.enableErrorReporting) {
      Sentry.setUser(null);
    }
  },

  addBreadcrumb: (breadcrumb: { message: string; category?: string; level?: 'info' | 'warning' | 'error'; data?: Record<string, any> }) => {
    if (config.prod.enableErrorReporting) {
      Sentry.addBreadcrumb({
        message: breadcrumb.message,
        category: breadcrumb.category || 'custom',
        level: breadcrumb.level || 'info',
        data: breadcrumb.data,
      });
    }
  },
};

// Analytics helpers
const isPostHogLoaded = () => {
  try {
    return typeof posthog !== 'undefined' && posthog && typeof posthog.capture === 'function';
  } catch {
    return false;
  }
};

export const analytics = {
  identify: (userId: string, traits?: Record<string, any>) => {
    if (config.prod.enableAnalytics && isPostHogLoaded()) {
      posthog.identify(userId, traits);
    }
  },

  track: (eventName: string, properties?: Record<string, any>) => {
    if (config.prod.enableAnalytics && isPostHogLoaded()) {
      posthog.capture(eventName, properties);
    }
    if (config.dev.enableConsoleLogs && config.dev.showPerformanceMetrics) {
      console.log('[Analytics]', eventName, properties);
    }
  },

  page: (pageName: string, properties?: Record<string, any>) => {
    if (config.prod.enableAnalytics && isPostHogLoaded()) {
      posthog.capture('$pageview', {
        page_name: pageName,
        ...properties,
      });
    }
  },

  reset: () => {
    if (config.prod.enableAnalytics && isPostHogLoaded()) {
      posthog.reset();
    }
  },
};

// Performance monitoring
// Store reference to native mark function to avoid recursion
const getNativeMark = () => {
  if (typeof globalThis !== 'undefined' && globalThis.performance) {
    const perf = globalThis.performance;
    // Get the original mark function from Performance prototype
    const nativeMark = Object.getOwnPropertyDescriptor(Performance.prototype, 'mark')?.value || perf.mark;
    return nativeMark && typeof nativeMark === 'function' ? nativeMark.bind(perf) : null;
  }
  return null;
};

export const performance = {
  mark: (name: string) => {
    const nativeMark = getNativeMark();
    if (nativeMark) {
      try {
        nativeMark(name);
      } catch (e) {
        // Silently fail if mark fails (e.g., in test environments)
      }
    }
  },

  measure: (name: string, startMark: string, endMark?: string) => {
    if (typeof globalThis !== 'undefined' && globalThis.performance && globalThis.performance.measure) {
      try {
        globalThis.performance.measure(name, startMark, endMark);
        const measure = globalThis.performance.getEntriesByName(name, 'measure')[0];
        if (measure && config.dev.showPerformanceMetrics) {
          console.log(`[Performance] ${name}: ${measure.duration.toFixed(2)}ms`);
        }
        return measure?.duration;
      } catch (error) {
        // Ignore measurement errors
      }
    }
    return undefined;
  },

  measureAsync: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const startMark = `${name}-start`;
    const endMark = `${name}-end`;
    if (typeof globalThis !== 'undefined' && globalThis.performance && globalThis.performance.mark) {
      globalThis.performance.mark(startMark);
    }
    try {
      const result = await fn();
      if (typeof globalThis !== 'undefined' && globalThis.performance && globalThis.performance.mark) {
        globalThis.performance.mark(endMark);
      }
      let duration: number | undefined;
      if (typeof globalThis !== 'undefined' && globalThis.performance && globalThis.performance.measure) {
        globalThis.performance.measure(name, startMark, endMark);
        const measure = globalThis.performance.getEntriesByName(name, 'measure')[0] as PerformanceMeasure | undefined;
        duration = measure?.duration;
      }
      
      // Track slow operations
      if (duration && duration > 1000) {
        errorTracking.captureMessage(`Slow operation: ${name}`, 'warning', {
          duration,
          operation: name,
        });
      }
      
      return result;
    } catch (error) {
      if (typeof globalThis !== 'undefined' && globalThis.performance && globalThis.performance.mark) {
        globalThis.performance.mark(endMark);
      }
      if (typeof globalThis !== 'undefined' && globalThis.performance && globalThis.performance.measure) {
        globalThis.performance.measure(name, startMark, endMark);
      }
      throw error;
    }
  },

  trackApiCall: (endpoint: string, duration: number, success: boolean) => {
    if (config.prod.enableAnalytics && isPostHogLoaded()) {
      try {
        posthog.capture('api_call', {
          endpoint,
          duration,
          success,
        });
      } catch (error) {
        // Silently fail if PostHog is not available
      }
    }
    
    // Log slow API calls
    if (duration > 2000) {
      errorTracking.captureMessage(`Slow API call: ${endpoint}`, 'warning', {
        endpoint,
        duration,
        success,
      });
    }
  },
};

// Initialize all monitoring
export const initMonitoring = () => {
  initErrorTracking();
  initAnalytics();
  
  if (config.dev.enableConsoleLogs) {
    console.log('[Monitoring] All monitoring services initialized');
  }
};

