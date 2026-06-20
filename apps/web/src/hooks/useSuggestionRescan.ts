import { useCallback, useMemo, useState } from 'react';
import {
  suggestionRescanApi,
  type SuggestionDomain,
  type SuggestionRescanSummary,
} from '../api/suggestionRescan';
import { formatSuggestionRescanToast } from '../lib/suggestionRescanToast';
import { useToast } from '../components/ui/toast';

export type SuggestionRescanNotifier = {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
};

export type UseSuggestionRescanOptions = {
  /** When false, caller handles UI feedback (inline notice, etc.). */
  showToast?: boolean;
  /** Reuse an existing toast instance (e.g. quest panel add/success toasts). */
  notify?: SuggestionRescanNotifier;
};

export function useSuggestionRescan(domain: SuggestionDomain, options: UseSuggestionRescanOptions = {}) {
  const { showToast = true, notify: externalNotify } = options;
  const internalToast = useToast({ maxVisible: 2 });
  const notify = useMemo(() => {
    if (externalNotify) return externalNotify;
    if (!showToast) return null;
    return { success: internalToast.success, error: internalToast.error };
  }, [externalNotify, showToast, internalToast.success, internalToast.error]);

  const [rescanning, setRescanning] = useState(false);
  const [lastSummary, setLastSummary] = useState<SuggestionRescanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rescan = useCallback(async () => {
    setRescanning(true);
    setError(null);
    try {
      const result = await suggestionRescanApi.rescan([domain]);
      setLastSummary(result.summary);
      notify?.success(formatSuggestionRescanToast(result.summary, domain), 6500);
      return result.summary;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Conversation rescan failed';
      setError(message);
      notify?.error(message);
      throw err;
    } finally {
      setRescanning(false);
    }
  }, [domain, notify]);

  return {
    rescan,
    rescanning,
    lastSummary,
    error,
    RescanToastContainer: externalNotify || !showToast ? null : internalToast.ToastContainer,
  };
}
