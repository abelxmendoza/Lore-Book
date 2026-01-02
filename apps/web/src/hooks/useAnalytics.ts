import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../lib/api';
import { getModuleByKey } from '../config/analyticsModules';
import { isDevelopment } from '../config/env';
import type { AnalyticsPayload } from '../../../server/src/services/analytics/types';

interface UseAnalyticsResult {
  data: AnalyticsPayload | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAnalytics(moduleKey: string | null): UseAnalyticsResult {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!moduleKey) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get endpoint from config
      const module = getModuleByKey(moduleKey);
      if (!module) {
        throw new Error(`Unknown analytics module: ${moduleKey}`);
      }

      const endpoint = module.apiEndpoint;

      // In development, allow mock data fallback
      const result = await fetchJson<AnalyticsPayload>(endpoint, undefined, {
        useMockData: isDevelopment,
        mockData: null // Will be handled by individual panels
      });
      setData(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch analytics data';
      setError(errorMessage);
      // In development, don't set data to null immediately - let panels handle mock data
      if (!isDevelopment) {
        setData(null);
      }
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [moduleKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData
  };
}

export function useMultipleAnalytics(moduleKeys: string[]) {
  const [data, setData] = useState<Record<string, AnalyticsPayload | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const fetchAll = async () => {
      // Initialize loading states
      const initialLoading: Record<string, boolean> = {};
      const initialErrors: Record<string, string | null> = {};
      moduleKeys.forEach(key => {
        initialLoading[key] = true;
        initialErrors[key] = null;
      });
      setLoading(initialLoading);
      setErrors(initialErrors);

      // Fetch all in parallel
      const promises = moduleKeys.map(async (key) => {
        const module = getModuleByKey(key);
        if (!module) {
          setErrors(prev => ({ ...prev, [key]: `Unknown module: ${key}` }));
          setLoading(prev => ({ ...prev, [key]: false }));
          return { key, data: null };
        }

        const endpoint = module.apiEndpoint;

        try {
          const result = await fetchJson<AnalyticsPayload>(endpoint);
          setData(prev => ({ ...prev, [key]: result }));
          setErrors(prev => ({ ...prev, [key]: null }));
          return { key, data: result };
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch';
          setErrors(prev => ({ ...prev, [key]: errorMessage }));
          setData(prev => ({ ...prev, [key]: null }));
          return { key, data: null };
        } finally {
          setLoading(prev => ({ ...prev, [key]: false }));
        }
      });

      await Promise.all(promises);
    };

    if (moduleKeys.length > 0) {
      fetchAll();
    }
  }, [moduleKeys.join(',')]);

  return { data, loading, errors };
}

