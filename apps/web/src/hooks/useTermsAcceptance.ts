import { useState, useEffect } from 'react';
import { fetchJson } from '../lib/api';

type TermsStatus = {
  accepted: boolean;
  acceptedAt: string | null;
  version: string;
};

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
        
        // Set a timeout to prevent hanging forever
        timeoutId = setTimeout(() => {
          console.warn('Terms status check timed out, defaulting to not accepted');
          setStatus({ accepted: false, acceptedAt: null, version: '1.0' });
          setLoading(false);
        }, 5000); // 5 second timeout
        
        const data = await fetchJson<TermsStatus>('/api/user/terms-status');
        clearTimeout(timeoutId);
        setStatus(data);
      } catch (err) {
        clearTimeout(timeoutId);
        console.error('Failed to check terms status:', err);
        const error = err instanceof Error ? err : new Error('Failed to check terms status');
        setError(error);
        
        // Always default to not accepted if check fails
        // This allows the app to still work and show the terms agreement
        console.warn('Defaulting to terms not accepted due to error');
        setStatus({ accepted: false, acceptedAt: null, version: '1.0' });
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

