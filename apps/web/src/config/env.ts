/**
 * Environment Configuration
 * 
 * Centralized configuration for development vs production modes.
 * This ensures the app works correctly in both environments while
 * maintaining accessibility and developer experience.
 */

// Detect environment
export const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
export const isProduction = import.meta.env.PROD || import.meta.env.MODE === 'production';
export const isStaging = import.meta.env.MODE === 'staging';

// API Configuration
// In dev, use '' so requests go to same origin and Vite proxies /api to localhost:4000 (no CORS).
// Even if VITE_API_URL is set to http://localhost:4000 in .env, we use proxy in dev to avoid CORS.
// Set VITE_API_URL to a remote URL (e.g. https://api.example.com) to bypass the proxy.
const rawApiUrl = (import.meta.env.VITE_API_URL as string) ?? '';
const useProxyInDev =
  isDevelopment &&
  (!rawApiUrl ||
    rawApiUrl === 'http://localhost:4000' ||
    rawApiUrl === 'http://127.0.0.1:4000');

/**
 * Returns the canonical API base URL for all fetch calls.
 * - Dev: '' → Vite proxy routes /api/* to localhost:4000 (no CORS)
 * - Prod with VITE_API_URL set: the Railway backend URL
 * - Prod without VITE_API_URL: '' with a hard console error — every request will
 *   silently hit the frontend origin (Vercel) and get HTML back.
 *   Fix: set VITE_API_URL in Vercel Dashboard → Project → Settings → Environment Variables
 */
export function getApiBaseUrl(): string {
  if (useProxyInDev) return '';
  if (rawApiUrl) return rawApiUrl;
  if (isProduction) {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
    console.error(
      '[ROUTING] ❌ VITE_API_URL is not set in this production build.\n' +
      `  All /api/* calls will resolve to: ${currentOrigin} (Vercel — returns HTML)\n` +
      '  Fix: Vercel Dashboard → Project → Settings → Environment Variables:\n' +
      '       VITE_API_URL = https://lore-book-production.up.railway.app\n' +
      '  Then redeploy.'
    );
  }
  return '';
}

export const API_URL = getApiBaseUrl();
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Development Features
export const DEV_FEATURES = {
  // Allow mock data when backend is unavailable
  // Enabled by default in production for frontend-only demo (can be disabled with VITE_USE_MOCK_DATA=false)
  allowMockData: isDevelopment || import.meta.env.VITE_USE_MOCK_DATA !== 'false',
  
  // Show detailed error messages
  verboseErrors: isDevelopment,
  
  // Enable console logging
  enableConsoleLogs: isDevelopment,
  
  // Show development warnings
  showDevWarnings: isDevelopment,
  
  // Allow skipping authentication in dev
  allowSkipAuth: isDevelopment && import.meta.env.VITE_ALLOW_SKIP_AUTH === 'true',
  
  // Enable hot reload optimizations
  fastRefresh: isDevelopment,
  
  // Show performance metrics
  showPerformanceMetrics: isDevelopment,
  
  // Enable debug overlays
  enableDebugOverlays: isDevelopment,

  /** Chat lifecycle simulation panel (thread/message animation QA). Force on with VITE_CHAT_LIFECYCLE_SIM=true */
  chatLifecycleSimulation:
    import.meta.env.VITE_CHAT_LIFECYCLE_SIM === 'true' ||
    (import.meta.env.VITE_CHAT_LIFECYCLE_SIM !== 'false' && isDevelopment),
  
  // Show development notice banner — off in production unless explicitly enabled
  showDevNotice: isDevelopment
    ? import.meta.env.VITE_SHOW_DEV_NOTICE !== 'false'
    : import.meta.env.VITE_SHOW_DEV_NOTICE === 'true',
} as const;

// Production Features
export const PROD_FEATURES = {
  // Strict error handling
  strictErrorHandling: isProduction,
  
  // Enable analytics (if configured)
  enableAnalytics: isProduction && import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
  
  // Enable error reporting
  enableErrorReporting: isProduction,
  
  // Optimize bundle size
  optimizeBundle: isProduction,
  
  // Disable source maps for security
  disableSourceMaps: isProduction,
} as const;

// Accessibility - Always enabled in both modes
export const ACCESSIBILITY = {
  // Always enable ARIA labels
  enableAriaLabels: true,
  
  // Always enable keyboard navigation
  enableKeyboardNav: true,
  
  // Always enable screen reader support
  enableScreenReader: true,
  
  // Always show focus indicators
  showFocusIndicators: true,
  
  // Always enable skip links
  enableSkipLinks: true,
} as const;

// API Behavior Configuration
export const API_CONFIG = {
  // Timeout for API calls — production uses 30s (mobile networks + admin aggregates are slow)
  timeout: isDevelopment ? 30000 : 30000,
  // Admin dashboard loads heavy aggregates; allow extra headroom on slow connections
  adminTimeout: isDevelopment ? 45000 : 45000,
  
  // Retry failed requests (disabled in dev for faster feedback)
  retryOnFailure: isProduction,
  maxRetries: isProduction ? 3 : 0,
  
  // Use mock data when backend unavailable (dev only)
  useMockDataOnFailure: isDevelopment,
  
  // Show loading states (always, but more verbose in dev)
  showLoadingStates: true,
  verboseLoading: isDevelopment,
} as const;

// Logging Configuration
export const LOGGING = {
  // Log level
  level: isDevelopment ? 'debug' : 'error',
  
  // Log API calls
  logApiCalls: isDevelopment,
  
  // Log performance metrics
  logPerformance: isDevelopment,
  
  // Log errors to console (always, but more detail in dev)
  logErrors: true,
  verboseErrors: isDevelopment,
} as const;

// Export a single config object
export const config = {
  env: {
    isDevelopment,
    isProduction,
    isStaging,
    mode: import.meta.env.MODE,
  },
  api: {
    url: API_URL,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_ANON_KEY,
    ...API_CONFIG,
  },
  dev: DEV_FEATURES,
  prod: PROD_FEATURES,
  accessibility: ACCESSIBILITY,
  logging: LOGGING,
} as const;

// Helper functions
export const log = {
  debug: (...args: any[]) => {
    if (LOGGING.level === 'debug' || isDevelopment) {
      console.log('[DEBUG]', ...args);
    }
  },
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.info('[INFO]', ...args);
    }
  },
  warn: (...args: any[]) => {
    console.warn('[WARN]', ...args);
  },
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
    // In production, you might want to send to error reporting service
    if (PROD_FEATURES.enableErrorReporting) {
      // TODO: Integrate with error reporting service (e.g., Sentry)
    }
  },
};

// Validate required environment variables in production
// Note: For frontend-only demo, Supabase is optional (mock data will be used)
if (isProduction) {
  const useMockData = import.meta.env.VITE_USE_MOCK_DATA !== 'false';
  
  // Only require Supabase if mock data is explicitly disabled
  if (!useMockData) {
    const missing: string[] = [];
    if (!SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
    if (!SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');
    
    if (missing.length > 0) {
      console.error('❌ Production build missing required environment variables:');
      missing.forEach(envVar => console.error(`   - ${envVar}`));
      // Don't exit in browser, but log error
      if (typeof window === 'undefined') {
        process.exit(1);
      }
    }
  } else if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // Log info that mock data will be used
    if (typeof window === 'undefined') {
      console.log('ℹ️  Supabase not configured - mock data will be used for frontend demo');
    }
  }
}

export default config;

