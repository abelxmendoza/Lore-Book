import { useState, useCallback } from 'react';

import { fetchJson } from '../../../lib/api';

export interface CorrectionResult {
  changed: boolean;
  revision: number;
  supersededUtterances: number;
  supersededUnits: number;
  reingestJobId: string | null;
}

/**
 * Correct a previously-sent (persisted) chat message. The backend versions the
 * message, tombstones the knowledge derived from the old text, and re-ingests
 * the corrected text so what Lore Book "knows" updates to match.
 */
export const useMessageCorrection = () => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correctMessage = useCallback(
    async (messageId: string, content: string, reason?: string): Promise<CorrectionResult | null> => {
      setSaving(true);
      setError(null);
      try {
        const result = await fetchJson<CorrectionResult>(`/api/chat/messages/${messageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, reason }),
        });
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save correction');
        return null;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  return { correctMessage, saving, error };
};
