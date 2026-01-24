import { supabase } from './supabase';
import { addCsrfHeaders } from './security';
import { config, log } from '../config/env';
import { performance as perfMonitoring, errorTracking } from './monitoring';
import { apiCache, generateCacheKey } from './cache';
import { handleError, createAppError, retryWithBackoff, type AppError } from './errorHandler';
import { getGlobalMockDataEnabled } from '../contexts/MockDataContext';

export const fetchJson = async <T>(
  input: RequestInfo, 
  init?: RequestInit,
  options?: {
    useMockData?: boolean;
    mockData?: T;
    onError?: (error: Error) => void;
  }
): Promise<T> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  
  // Use configured API URL
  const apiBaseUrl = config.api.url;
  
  // If input is a relative URL, prepend the API base URL
  const url = typeof input === 'string' && input.startsWith('/') 
    ? `${apiBaseUrl}${input}`
    : input;
  
  // Log API call in development
  if (config.logging.logApiCalls) {
    log.debug(`API Call: ${typeof input === 'string' ? input : 'Request'}`, { method: init?.method || 'GET' });
  }
  
  const startTime = performance.now();
  
  // Check global mock data toggle
  const globalMockEnabled = getGlobalMockDataEnabled();
  const shouldUseMock = (globalMockEnabled || options?.useMockData === true) && 
                       options?.useMockData !== false;
  
  // Check cache for GET requests (skip cache if using mock data)
  const isGetRequest = !init?.method || init.method === 'GET';
  const useCache = !shouldUseMock && isGetRequest;
  
  if (useCache) {
    const cacheKey = generateCacheKey(url, init);
    const cached = apiCache.get<T>(cacheKey);
    
    if (cached !== null) {
      if (config.logging.logApiCalls) {
        log.debug(`API Cache Hit: ${typeof input === 'string' ? input : 'Request'}`);
      }
      return cached;
    }
  }
  
  // Create abort controller for timeout (declare outside try for catch access)
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | null = null;
  
  try {
    // Add CSRF token and auth headers
    const headers = addCsrfHeaders({
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    });
    
    // Set timeout
    timeoutId = setTimeout(() => controller.abort(), config.api.timeout);
    
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      ...init
    });
    
    if (timeoutId) clearTimeout(timeoutId);
    
    // Track performance
    const duration = performance.now() - startTime;
    perfMonitoring.trackApiCall(typeof input === 'string' ? input : 'Request', duration, true);
    
    // Log performance in development
    if (config.logging.logPerformance) {
      log.debug(`API Response: ${duration.toFixed(2)}ms`, { url: typeof input === 'string' ? input : 'Request' });
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      const errorMessage = error.error || error.message || `HTTP ${res.status}: ${res.statusText}`;
      
      // Check if backend is not running (dev mode or when mock data is enabled)
      if ((config.dev.allowMockData || globalMockEnabled) && (res.status === 0 || res.status === 503 || res.status === 502)) {
        if (shouldUseMock && options?.mockData) {
          if (config.env.isDevelopment || globalMockEnabled) {
            log.warn('Backend unavailable, using mock data:', typeof input === 'string' ? input : 'Request');
          }
          return options.mockData;
        }
        if (config.dev.verboseErrors) {
          log.warn('Backend server is not running. Using fallback behavior.');
        }
      }
      
      // Check for authentication errors
      if (res.status === 401) {
        const authError = new Error('Authentication required. Please sign in again.');
        if (options?.onError) options.onError(authError);
        throw authError;
      }
      
      const apiError = new Error(errorMessage);
      if (options?.onError) options.onError(apiError);
      throw apiError;
    }
    
    const data = await res.json();
    
    // Cache successful GET responses
    if (useCache && res.ok) {
      const cacheKey = generateCacheKey(url, init);
      // Cache for 5 minutes by default, or use custom TTL
      const ttl = options?.mockData ? undefined : 5 * 60 * 1000;
      apiCache.set(cacheKey, data, ttl);
    }
    
    // Invalidate related cache on mutations
    if (init?.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method)) {
      const urlPattern = url.split('?')[0]; // Remove query params
      const pattern = new RegExp(urlPattern.replace(/\/[^/]+$/, '/.*'));
      apiCache.deletePattern(pattern);
    }
    
    return data;
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    
    // Network errors (backend not running)
    const isNetworkError = 
      (error instanceof TypeError && (
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('ERR_CONNECTION_REFUSED') ||
        error.message.includes('ERR_INTERNET_DISCONNECTED') ||
        error.message.includes('ERR_NETWORK_CHANGED')
      )) ||
      (error instanceof Error && error.name === 'NetworkError') ||
      (error instanceof DOMException && error.name === 'NetworkError');
    
    if (isNetworkError) {
      // Log detailed error info for debugging
      if (config.env.isDevelopment) {
        log.error('Network error detected:', {
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : 'Unknown',
          url: typeof input === 'string' ? input : 'Request',
          apiBaseUrl,
          timestamp: new Date().toISOString(),
        });
        
        // Check if backend is actually reachable
        try {
          const healthController = new AbortController();
          const healthTimeout = setTimeout(() => healthController.abort(), 2000);
          const healthCheck = await fetch(`${apiBaseUrl}/api/health`, { 
            method: 'GET',
            signal: healthController.signal
          }).catch(() => null);
          clearTimeout(healthTimeout);
          
          if (!healthCheck || !healthCheck.ok) {
            log.error('Backend health check failed. Server may not be running.', {
              expectedUrl: `${apiBaseUrl}/api/health`,
              suggestion: 'Run: cd apps/server && npm run dev'
            });
          }
        } catch (healthError) {
          // Health check also failed, backend is definitely down
          log.error('Backend server is not running.', {
            expectedUrl: apiBaseUrl,
            suggestion: 'Start the backend server: cd apps/server && npm run dev',
            originalError: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      // Allow mock data fallback when enabled (dev or production with global toggle)
      if ((config.dev.allowMockData || globalMockEnabled) && shouldUseMock && options?.mockData) {
        if (config.env.isDevelopment || globalMockEnabled) {
          log.warn('Network error, using mock data:', typeof input === 'string' ? input : 'Request');
        }
        return options.mockData;
      }
      
      const networkError = createAppError(
        config.dev.verboseErrors 
          ? `Cannot connect to backend server at ${apiBaseUrl}. Make sure it's running.`
          : 'Unable to connect to server. Please try again later.',
        'network',
        {
          code: 'CONNECTION_REFUSED',
          userMessage: config.dev.verboseErrors
            ? `Backend server is not running. Start it with: cd apps/server && npm run dev`
            : 'Unable to connect to server. Please check your connection and try again.',
          retryable: true,
          context: {
            url: typeof input === 'string' ? input : 'Request',
            apiBaseUrl,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
          originalError: error instanceof Error ? error : new Error(String(error)),
        }
      );
      
      if (options?.onError) options.onError(networkError);
      throw networkError;
    }
    
    // Abort errors (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      const timeoutError = new Error('Request timed out. Please try again.');
      if (options?.onError) options.onError(timeoutError);
      throw timeoutError;
    }
    
    // Track failed API calls
    const duration = performance.now() - startTime;
    perfMonitoring.trackApiCall(typeof input === 'string' ? input : 'Request', duration, false);
    
    // Handle and report error
    const appError = handleError(error, {
      component: 'api',
      action: typeof input === 'string' ? input : 'Request',
      metadata: {
        url: typeof input === 'string' ? input : 'Request',
        method: init?.method || 'GET',
        duration: duration,
      },
    });
    
    if (options?.onError) {
      options.onError(appError);
    }
    
    throw appError;
  }
};
