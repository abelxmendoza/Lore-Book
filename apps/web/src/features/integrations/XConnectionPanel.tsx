import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Link2, Loader2, RefreshCw, Unlink, Twitter, Copy, Info } from 'lucide-react';

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
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);
  const [usingOverride, setUsingOverride] = useState(false);

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

  const loadCallbackUrl = useCallback(async () => {
    try {
      const res = await fetchJson<{ redirectUri: string; usingExplicitRedirectUri?: boolean; clientId?: string | null }>('/api/integrations/x/callback-url');
      setCallbackUrl(res.redirectUri);
      setUsingOverride(!!res.usingExplicitRedirectUri);
      if (res.usingExplicitRedirectUri) {
        console.info('[X OAuth] Using explicit X_OAUTH_REDIRECT_URI from env:', res.redirectUri);
      }
    } catch {
      // fallback for local dev
      setCallbackUrl('http://localhost:4000/api/integrations/x/callback');
    }
  }, []);

  useEffect(() => {
    void load();
    void loadCallbackUrl();
  }, [load, loadCallbackUrl]);

  // Client-side hint when we see a 127 variant (common with Vite proxy)
  useEffect(() => {
    if (callbackUrl && /127\.0\.0\.1/.test(callbackUrl)) {
      console.warn('[X OAuth] Using 127.0.0.1 callback. If X rejects, register this exact value (or set X_OAUTH_REDIRECT_URI in server .env and restart). Prefer also registering the localhost equivalent.');
    }
  }, [callbackUrl]);

  // Handle redirect back from X OAuth (success or error via ?x= params)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const xParam = params.get('x');
    if (xParam === 'connected') {
      setMessage('X connected successfully. Sync your posts to import history.');
      // clean URL
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
      void load();
    } else if (xParam === 'error') {
      const desc = params.get('desc') || params.get('error_description');
      setError(desc ? `X authorization failed: ${desc}.` : 'X authorization failed. Check callback URL registration and try again.');
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
  }, [load]);

  const connect = async () => {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchJson<{ authorizationUrl: string; redirectUri?: string }>('/api/integrations/x/begin', {
        method: 'POST',
        body: JSON.stringify({ returnTo: '/account' }),
      });
      if (result.redirectUri) {
        // Helpful for user to verify in X developer portal
        console.info('[X OAuth] Register this EXACT Callback URL:', result.redirectUri);
      }
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
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
          <Twitter className="h-5 w-5 text-white/90" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-white">X (Twitter)</h3>
            {status?.connected ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.03] px-2.5 py-0.5 text-xs font-medium text-white/50">
                Not connected
              </span>
            )}
          </div>

          <p className="mt-1.5 text-sm leading-relaxed text-white/55">
            Import your original posts and replies into LoreBook as personal history.
            X post IDs and permalinks are preserved for provenance.
          </p>

          {/* Guidance for OAuth setup — the #1 cause of "Something went wrong / give access" + 400 errors on /authorize */}
          {!loading && !status?.connected && callbackUrl && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-200/90">
              <div className="flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <div>
                    <span className="font-semibold">Critical:</span> The redirect URI below <span className="font-mono text-amber-100 break-all">{callbackUrl}</span> {usingOverride && <span className="text-[10px] text-amber-300">(forced by X_OAUTH_REDIRECT_URI)</span>} must be registered <strong>exactly</strong> (copy-paste) in{' '}
                    <a href="https://developer.x.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white font-medium">X Developer Portal → your App → User authentication settings → Callback URLs</a>.
                  </div>
                  <div className="text-[10px] text-amber-200/70">
                    • Best: Add <span className="font-mono">both</span> versions:<br/>
                    &nbsp;&nbsp;http://localhost:4000/api/integrations/x/callback<br/>
                    &nbsp;&nbsp;http://127.0.0.1:4000/api/integrations/x/callback<br/>
                    • Use the <strong>OAuth 2.0 Client ID &amp; Secret</strong> (separate from old Consumer API keys).<br/>
                    • Check your server console after clicking Connect — it logs the exact redirectUri being sent.<br/>
                    • Troubleshooting: Try in a fresh incognito window (many extensions interfere with x.com OAuth).
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (callbackUrl) {
                    const variants = new Set([callbackUrl, callbackUrl.replace('127.0.0.1', 'localhost'), callbackUrl.replace('localhost', '127.0.0.1')]);
                    const text = Array.from(variants).join('\n');
                    navigator.clipboard?.writeText(text);
                    setMessage('Copied common variants — register all of them in X settings for robustness.');
                  }
                }}
                className="mt-1.5 inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] hover:bg-amber-500/20"
              >
                <Copy className="h-3 w-3" /> Copy callback + variants
              </button>
            </div>
          )}

          {status?.connected && (
            <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
              <div className="text-white/40">
                Account <span className="font-mono text-white/70">@{status.username ?? 'unknown'}</span>
              </div>
              <div className="text-white/40">
                Last sync <span className="text-white/70">{formatDate(status.lastSyncAt)}</span>
              </div>
              <div className="text-white/40 sm:col-span-2">
                Scopes <span className="font-mono text-white/60">{status.scopes.length ? status.scopes.join(', ') : '—'}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {loading ? (
            <div className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : status?.connected ? (
            <>
              <button
                type="button"
                onClick={sync}
                disabled={working}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {working ? 'Syncing…' : 'Sync posts'}
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={working}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.02] px-3.5 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
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
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {working ? 'Connecting…' : 'Connect X'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300">
          {message}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-300">
          {error}
          <div className="mt-1 text-[11px] text-red-300/70">
            Most common cause: redirect_uri in the generated authorize URL did not exactly match any Callback URL registered for your Client ID in the X Developer Portal (see amber box above).<br />
            Check your backend server logs after clicking "Connect X" — it prints the exact redirectUri used. Also try registering both <span className="font-mono">localhost:4000</span> and <span className="font-mono">127.0.0.1:4000</span> variants.
          </div>
        </div>
      )}
    </div>
  );
}
