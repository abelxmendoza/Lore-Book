import { useState, useEffect } from 'react';
import { fetchJson } from '../lib/api';
import { config } from '../config/env';
import { getGlobalMockDataEnabled } from '../contexts/MockDataContext';

type TermsStatus = {
  accepted: boolean;
  acceptedAt: string | null;
  version: string;
};

const DEFAULT_TERMS_STATUS: TermsStatus = { accepted: false, acceptedAt: null, version: '1.0' };

export const useTermsAcceptance = () => {
  const [status, setStatus] = useState<TermsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const checkTermsStatus = async () => {
      try {
        setLoading(true);
        setError(null);
        
        timeoutId = setTimeout(() => {
          setStatus(DEFAULT_TERMS_STATUS);
          setLoading(false);
        }, 5000);
        
        const useMockFallback = getGlobalMockDataEnabled() || config.dev.allowMockData;
        const data = await fetchJson<TermsStatus>('/api/user/terms-status', undefined, {
          useMockData: useMockFallback,
          mockData: DEFAULT_TERMS_STATUS,
        });
        clearTimeout(timeoutId);
        setStatus(data);
      } catch (err) {
        clearTimeout(timeoutId);
        const errorObj = err instanceof Error ? err : new Error('Failed to check terms status');
        setError(errorObj);
        setStatus(DEFAULT_TERMS_STATUS);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };

    checkTermsStatus();
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return { status, loading, error };
};

