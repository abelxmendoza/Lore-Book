/**
 * useFetch Hook
 * 
 * A reusable hook for data fetching with:
 * - Automatic retry logic
 * - Error handling
 * - Loading states
 * - Cache integration
 * - Type safety
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchJson } from '../lib/api';
import { handleError, getUserFriendlyMessage, retryWithBackoff, type AppError } from '../lib/errorHandler';
import { monitoring } from '../lib/monitoring';

export interface UseFetchOptions<T> {
  /**
   * Whether to fetch immediately on mount
   */
  immediate?: boolean;
  
  /**
   * Retry configuration
   */
  retry?: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  };
  
  /**
   * Cache TTL in milliseconds
   */
  cacheTTL?: number;
  
  /**
   * Mock data for development
   */
  mockData?: T;
  
  /**
   * Callback when data is fetched successfully
   */
  onSuccess?: (data: T) => void;
  
  /**
   * Callback when fetch fails
   */
  onError?: (error: AppError) => void;
  
  /**
   * Dependencies that trigger refetch
   */
  deps?: React.DependencyList;
  
  /**
   * Component name for error tracking
   */
  componentName?: string;
}

export interface UseFetchResult<T> {
  /**
   * The fetched data
   */
  data: T | null;
  
  /**
   * Loading state
   */
  loading: boolean;
  
  /**
   * Error state
   */
  error: AppError | null;
  
  /**
   * User-friendly error message
   */
  errorMessage: string | null;
  
  /**
   * Manually trigger a fetch
   */
  refetch: () => Promise<void>;
  
  /**
   * Clear error state
   */
  clearError: () => void;
  
  /**
   * Whether the error is retryable
   */
  isRetryable: boolean;
}

/**
 * Hook for fetching data with retry logic and error handling
 */
export function useFetch<T>(
  url: string | null,
  options: UseFetchOptions<T> = {}
): UseFetchResult<T> {
  const {
    immediate = true,
    retry: retryOptions,
    cacheTTL,
    mockData,
    onSuccess,
    onError,
    deps = [],
    componentName = 'useFetch',
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<AppError | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (!url) {
      setLoading(false);
      return;
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);

    try {
      const fetchFn = async () => {
        return await fetchJson<T>(url, {
          signal: abortControllerRef.current?.signal,
        }, {
          useMockData: !!mockData,
          mockData,
        });
      };

      const result = retryOptions
        ? await retryWithBackoff(fetchFn, retryOptions)
        : await fetchFn();

      setData(result);
      if (onSuccess) {
        onSuccess(result);
      }

      // Track successful fetch
      monitoring.trackEvent('data_fetch_success', {
        url,
        component: componentName,
      });
    } catch (err) {
      // Don't set error if request was aborted
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      const appError = handleError(err, {
        component: componentName,
        action: 'fetch',
        metadata: { url },
      });

      setError(appError);
      
      if (onError) {
        onError(appError);
      }

      // Track failed fetch
      monitoring.trackEvent('data_fetch_error', {
        url,
        component: componentName,
        error: appError.message,
      });
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [url, mockData, onSuccess, onError, componentName, ...deps]);

  useEffect(() => {
    if (immediate && url) {
      void fetchData();
    }

    // Cleanup: abort request on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [immediate, url, fetchData, ...deps]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const errorMessage = error ? getUserFriendlyMessage(error) : null;
  const isRetryable = error ? error.category === 'network' || error.category === 'server' : false;

  return {
    data,
    loading,
    error,
    errorMessage,
    refetch: fetchData,
    clearError,
    isRetryable,
  };
}

/**
 * Hook for fetching data with polling
 */
export function usePolling<T>(
  url: string | null,
  interval: number,
  options: UseFetchOptions<T> = {}
): UseFetchResult<T> {
  const result = useFetch<T>(url, { ...options, immediate: true });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (url && interval > 0) {
      intervalRef.current = setInterval(() => {
        void result.refetch();
      }, interval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [url, interval, result.refetch]);

  return result;
}

/**
 * Hook for fetching data with manual trigger only
 */
export function useLazyFetch<T>(
  url: string | null,
  options: UseFetchOptions<T> = {}
): Omit<UseFetchResult<T>, 'data' | 'loading' | 'error' | 'errorMessage' | 'isRetryable'> & {
  data: T | null;
  loading: boolean;
  error: AppError | null;
  errorMessage: string | null;
  isRetryable: boolean;
} {
  return useFetch<T>(url, { ...options, immediate: false });
}

