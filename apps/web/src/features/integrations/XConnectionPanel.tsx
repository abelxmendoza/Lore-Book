import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';

import { fetchJson } from '../../lib/api';

type XStatus = {
  connected: boolean;
  username: string | null;
  providerUserId: string | null;
  scopes: string[];
  expiresAt: string | null;
  lastSyncAt: string | null;
  status: string;
};

type XSyncResult = {
  count: number;
  imported?: number;
  skipped?: number;
};

function formatDate(value?: string | null) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function XConnectionPanel() {
  const [status, setStatus] = useState<XStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchJson<XStatus>('/api/integrations/x/status');
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load X connection');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    setWorking(true);
    setError(null);
    try {
      const result = await fetchJson<{ authorizationUrl: string }>('/api/integrations/x/begin', {
        method: 'POST',
        body: JSON.stringify({ returnTo: '/account' }),
      });
      window.location.href = result.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start X connection');
      setWorking(false);
    }
  };

  const sync = async () => {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchJson<XSyncResult>('/api/integrations/x/sync', {
        method: 'POST',
        body: JSON.stringify({ maxPosts: 25 }),
      });
      const imported = result.imported ?? result.count;
      const skipped = result.skipped ?? 0;
      setMessage(`Imported ${imported} original X posts${skipped ? `; skipped ${skipped} already in LoreBook` : ''}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync X posts');
    } finally {
      setWorking(false);
    }
  };

  const disconnect = async () => {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      await fetchJson('/api/integrations/x/connection', { method: 'DELETE' });
      setMessage('X disconnected.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect X');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">X</h3>
            {status?.connected && (
              <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/45">
            Import your original posts into LoreBook as personal history, with X post IDs and URLs preserved.
          </p>
          {status?.connected && (
            <div className="mt-3 grid gap-1 text-xs text-white/45">
              <p>@{status.username ?? 'unknown'}</p>
              <p>Last sync: {formatDate(status.lastSyncAt)}</p>
              <p>Scopes: {status.scopes.length ? status.scopes.join(', ') : 'unknown'}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {loading ? (
            <span className="inline-flex items-center gap-2 px-3 py-2 text-sm text-white/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading
            </span>
          ) : status?.connected ? (
            <>
              <button
                type="button"
                onClick={sync}
                disabled={working}
                className="inline-flex items-center gap-2 rounded-lg border border-primary/35 bg-primary/15 px-3 py-2 text-sm text-white hover:bg-primary/25 disabled:opacity-50"
              >
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sync
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={working}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-white/60 hover:text-white disabled:opacity-50"
              >
                <Unlink className="h-4 w-4" />
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={connect}
              disabled={working}
              className="inline-flex items-center gap-2 rounded-lg border border-primary/35 bg-primary/15 px-3 py-2 text-sm text-white hover:bg-primary/25 disabled:opacity-50"
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Connect X
            </button>
          )}
        </div>
      </div>

      {message && <p className="mt-4 text-sm text-emerald-300">{message}</p>}
      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
    </div>
  );
}
