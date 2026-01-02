/**
 * Development utilities - only active in development mode
 */

const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

/**
 * Development logger - only logs in dev mode
 */
export const devLog = {
  log: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log('[DEV]', ...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (isDevelopment) {
      console.warn('[DEV]', ...args);
    }
  },
  error: (...args: unknown[]) => {
    if (isDevelopment) {
      console.error('[DEV]', ...args);
    }
  },
  group: (label: string) => {
    if (isDevelopment) {
      console.group(`[DEV] ${label}`);
    }
  },
  groupEnd: () => {
    if (isDevelopment) {
      console.groupEnd();
    }
  },
  table: (data: unknown) => {
    if (isDevelopment) {
      console.table(data);
    }
  }
};

/**
 * Performance timing utility
 */
export const devTimer = {
  start: (label: string): (() => void) => {
    if (!isDevelopment) return () => {};
    
    const start = performance.now();
    devLog.log(`⏱️  Started: ${label}`);
    
    return () => {
      const duration = performance.now() - start;
      devLog.log(`⏱️  Completed: ${label} (${duration.toFixed(2)}ms)`);
    };
  }
};

/**
 * React component render counter (for debugging re-renders)
 */
export const useRenderCount = (componentName: string): void => {
  if (!isDevelopment) return;
  
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const React = require('react');
  const countRef = React.useRef(0);
  countRef.current++;
  devLog.log(`🔄 ${componentName} rendered ${countRef.current} times`);
};

/**
 * API request logger
 */
export const logApiRequest = (url: string, options?: RequestInit): void => {
  if (!isDevelopment) return;
  
  devLog.group(`🌐 API Request: ${options?.method || 'GET'} ${url}`);
  if (options?.body) {
    try {
      const body = JSON.parse(options.body as string);
      devLog.table(body);
    } catch {
      devLog.log('Body:', options.body);
    }
  }
  devLog.groupEnd();
};

/**
 * API response logger
 */
export const logApiResponse = (url: string, response: Response, data?: unknown): void => {
  if (!isDevelopment) return;
  
  const status = response.status;
  const statusEmoji = status >= 200 && status < 300 ? '✅' : status >= 400 ? '❌' : '⚠️';
  
  devLog.group(`${statusEmoji} API Response: ${status} ${url}`);
  if (data) {
    devLog.table(data);
  }
  devLog.groupEnd();
};

/**
 * Check if we're in development mode
 */
export const isDev = (): boolean => isDevelopment;

