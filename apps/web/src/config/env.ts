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
export const API_URL = import.meta.env.VITE_API_URL || (isDevelopment ? 'http://localhost:4000' : '');
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
  
  // Show development notice banner
  // CRITICAL: Always show in production unless explicitly disabled
  // This ensures users know the app is still in development
  // To disable: set VITE_SHOW_DEV_NOTICE=false in environment variables
  showDevNotice: import.meta.env.VITE_SHOW_DEV_NOTICE === 'false' ? false : true,
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
  // Timeout for API calls (longer in dev for debugging)
  timeout: isDevelopment ? 30000 : 10000,
  
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

