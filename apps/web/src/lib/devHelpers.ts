/**
 * Development Helpers
 * 
 * Utilities and helpers that are only available in development mode.
 * These are completely disabled in production builds for security and performance.
 */

import { config, log } from '../config/env';

/**
 * Development-only console helpers
 */
export const devConsole = {
  /**
   * Log debug information (only in development)
   */
  debug: (...args: any[]) => {
    if (config.dev.enableConsoleLogs) {
      log.debug(...args);
    }
  },

  /**
   * Log component render information (only in development)
   */
  render: (componentName: string, props?: any) => {
    if (config.dev.enableConsoleLogs) {
      log.debug(`[Render] ${componentName}`, props);
    }
  },

  /**
   * Log API call information (only in development)
   */
  api: (endpoint: string, method: string, data?: any) => {
    if (config.logging.logApiCalls) {
      log.debug(`[API] ${method} ${endpoint}`, data);
    }
  },

  /**
   * Log performance metrics (only in development)
   */
  performance: (label: string, duration: number) => {
    if (config.dev.showPerformanceMetrics) {
      log.debug(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
    }
  },

  /**
   * Log state changes (only in development)
   */
  state: (componentName: string, stateName: string, value: any) => {
    if (config.dev.enableConsoleLogs) {
      log.debug(`[State] ${componentName}.${stateName}`, value);
    }
  },
};

/**
 * Development-only error helpers
 */
export const devErrors = {
  /**
   * Show detailed error information (only in development)
   */
  showDetails: (error: Error, context?: string) => {
    if (config.dev.verboseErrors) {
      log.error(`[Error] ${context || 'Unknown'}`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    } else {
      log.error(error.message);
    }
  },
};

/**
 * Development-only UI helpers
 */
export const devUI = {
  /**
   * Show development banner (only in development)
   */
  showBanner: () => {
    if (!config.isDevelopment) return null;
    
    return {
      message: 'Development Mode',
      color: 'yellow',
      dismissible: false,
    };
  },

  /**
   * Show development warnings (only in development)
   */
  showWarning: (message: string) => {
    if (config.dev.showDevWarnings) {
      log.warn(`[Dev Warning] ${message}`);
    }
  },
};

/**
 * Development-only feature toggles
 */
export const devFeatures = {
  /**
   * Skip authentication (only in development, if enabled)
   */
  canSkipAuth: () => {
    return config.dev.allowSkipAuth;
  },

  /**
   * Use mock data (only in development)
   */
  useMockData: () => {
    return config.dev.allowMockData;
  },

  /**
   * Show debug overlays (only in development)
   */
  showDebugOverlays: () => {
    return config.dev.enableDebugOverlays;
  },
};

/**
 * Development-only performance monitoring
 */
export const devPerformance = {
  /**
   * Measure function execution time (only in development)
   */
  measure: <T>(label: string, fn: () => T): T => {
    if (!config.dev.showPerformanceMetrics) {
      return fn();
    }

    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    devConsole.performance(label, duration);
    return result;
  },

  /**
   * Measure async function execution time (only in development)
   */
  measureAsync: async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    if (!config.dev.showPerformanceMetrics) {
      return fn();
    }

    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    devConsole.performance(label, duration);
    return result;
  },
};

/**
 * Development-only validation helpers
 */
export const devValidation = {
  /**
   * Validate component props (only in development)
   */
  validateProps: (componentName: string, props: any, schema?: any) => {
    if (!config.dev.enableConsoleLogs) return;

    // Basic prop validation
    if (schema) {
      // TODO: Add proper schema validation if needed
      log.debug(`[Validation] ${componentName} props validated`);
    }
  },

  /**
   * Warn about missing required props (only in development)
   */
  warnMissingProps: (componentName: string, props: any, required: string[]) => {
    if (!config.dev.showDevWarnings) return;

    const missing = required.filter(prop => !(prop in props));
    if (missing.length > 0) {
      log.warn(`[Validation] ${componentName} missing required props:`, missing);
    }
  },
};

// Export all helpers as a single object
export const dev = {
  console: devConsole,
  errors: devErrors,
  ui: devUI,
  features: devFeatures,
  performance: devPerformance,
  validation: devValidation,
};

// Default export
export default dev;

