import { supabase } from './supabase';
import { addCsrfHeaders } from './security';
import { config, log } from '../config/env';

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
  
  try {
    // Add CSRF token and auth headers
    const headers = addCsrfHeaders({
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    });
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.api.timeout);
    
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      ...init
    });
    
    clearTimeout(timeoutId);
    
    // Log performance in development
    if (config.logging.logPerformance) {
      const duration = performance.now() - startTime;
      log.debug(`API Response: ${duration.toFixed(2)}ms`, { url: typeof input === 'string' ? input : 'Request' });
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      const errorMessage = error.error || error.message || `HTTP ${res.status}: ${res.statusText}`;
      
      // Check if backend is not running (dev mode or when mock data is enabled)
      if (config.dev.allowMockData && (res.status === 0 || res.status === 503 || res.status === 502)) {
        if (options?.useMockData && options?.mockData) {
          if (config.isDevelopment) {
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
    
    return res.json();
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Network errors (backend not running)
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      // Allow mock data fallback when enabled (dev or production with VITE_USE_MOCK_DATA)
      if (config.dev.allowMockData && options?.useMockData && options?.mockData) {
        if (config.isDevelopment) {
          log.warn('Network error, using mock data:', typeof input === 'string' ? input : 'Request');
        }
        return options.mockData;
      }
      
      const networkError = new Error(
        config.dev.verboseErrors 
          ? 'Cannot connect to backend server. Make sure it\'s running on http://localhost:4000'
          : 'Unable to connect to server. Please try again later.'
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
    
    if (options?.onError && error instanceof Error) {
      options.onError(error);
    }
    throw error;
  }
};
