import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchJson } from '../../../lib/api';

export type StaleProjectionHint = {
  id: string;
  type: 'biography_snapshot' | 'timeline_event';
  title?: string;
  summary?: string;
};

type StaleProjectionPanelProps = {
  hints: StaleProjectionHint[];
  summary?: string | null;
};

type RefreshStaleResponse = {
  results: Array<{ refreshed: boolean; artifactId: string; message?: string }>;
  refreshed: number;
};

export function StaleProjectionPanel({ hints, summary }: StaleProjectionPanelProps) {
  const navigate = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  if (hints.length === 0) return null;

  const refreshAll = async () => {
    setRefreshing(true);
    setRefreshNote(null);
    try {
      const result = await fetchJson<RefreshStaleResponse>('/api/artifacts/refresh-stale', {
        method: 'POST',
        body: JSON.stringify({
          items: hints.map((h) => ({ id: h.id, type: h.type, stale: true })),
        }),
      });
      if (result.refreshed > 0) {
        setRefreshNote(`Refreshed ${result.refreshed} summar${result.refreshed === 1 ? 'y' : 'ies'} from your latest memories.`);
      } else {
        setRefreshNote('Could not refresh summaries right now. Try What AI Knows.');
      }
    } catch {
      setRefreshNote('Refresh failed. Open What AI Knows to retry.');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div
      className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2.5"
      data-testid="stale-projection-panel"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400/90 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-amber-100/90 leading-relaxed">
            {summary ??
              'Some derived summaries may be outdated after your recent memory corrections.'}
          </p>
          {refreshNote && (
            <p className="text-xs text-emerald-300/80 mt-1">{refreshNote}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/what-ai-knows?tab=stale')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-zinc-600/60 text-zinc-200 hover:bg-zinc-800/60 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Open What AI Knows
            </button>
            <button
              type="button"
              onClick={refreshAll}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-amber-400/30 text-amber-200 hover:bg-amber-400/10 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh summaries'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
