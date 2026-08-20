/**
 * Server-side error tracking (Sentry).
 *
 * Mirrors apps/web/src/lib/monitoring.ts so the same mental model applies on
 * both sides: opt-in via DSN presence, no-op (console-only) without one.
 */
import * as Sentry from '@sentry/node';

import { logger } from '../logger';
import { isProductionRuntime } from '../config/runtimePolicy';

let initialized = false;

/** Initialize Sentry. Must run before other modules are imported to catch
 *  errors during their own module-load side effects. No-op without a DSN. */
export function initErrorTracking(): void {
  const dsn = process.env.SENTRY_DSN;
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

  if (!dsn || isTest) {
    return;
  }

  try {
    const isProduction = isProductionRuntime();
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || (isProduction ? 'production' : 'development'),
      release: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.npm_package_version || 'unknown',
      tracesSampleRate: isProduction ? 0.1 : 1.0,
      // Never send request bodies/headers by default — chat payloads and
      // auth headers can carry user content and secrets.
      sendDefaultPii: false,
      beforeSend(event, hint) {
        const error = hint.originalException;
        // These are already handled as survivable in index.ts's process
        // guards (peer disconnects) — don't spend Sentry quota on them.
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error.code === 'EPIPE' || error.code === 'ECONNRESET')
        ) {
          return null;
        }
        return event;
      },
    });
    initialized = true;
    logger.info({ environment: process.env.SENTRY_ENVIRONMENT }, '[Monitoring] Error tracking initialized');
  } catch (error) {
    logger.error({ error }, '[Monitoring] Failed to initialize error tracking');
  }
}

export const errorTracking = {
  captureException: (error: unknown, context?: Record<string, unknown>) => {
    if (initialized) {
      Sentry.captureException(error, { contexts: { custom: context ?? {} } });
    }
  },

  captureMessage: (message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, unknown>) => {
    if (initialized) {
      Sentry.captureMessage(message, { level, contexts: { custom: context ?? {} } });
    }
  },

  setUser: (user: { id: string; email?: string }) => {
    if (initialized) {
      Sentry.setUser({ id: user.id, email: user.email });
    }
  },

  addBreadcrumb: (breadcrumb: { message: string; category?: string; level?: 'info' | 'warning' | 'error'; data?: Record<string, unknown> }) => {
    if (initialized) {
      Sentry.addBreadcrumb({
        message: breadcrumb.message,
        category: breadcrumb.category || 'custom',
        level: breadcrumb.level || 'info',
        data: breadcrumb.data,
      });
    }
  },

  /** Wait for pending events to send — call before process.exit() on a fatal path. */
  flush: async (timeoutMs = 2000): Promise<boolean> => {
    if (!initialized) return true;
    try {
      return await Sentry.flush(timeoutMs);
    } catch {
      return false;
    }
  },
};
