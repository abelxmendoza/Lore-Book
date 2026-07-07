import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Link2, Loader2, RefreshCw, Unlink, Twitter, Copy, Info } from 'lucide-react';

import { fetchJson } from '../../lib/api';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';

type LoreIntakeMode = 'reference_only' | 'conservative' | 'review_first';

type XEntityRef = { id?: string; name: string; type: string };

type XHeldCandidate = XEntityRef & {
  provenance?: { sourceId?: string; url?: string; postedAt?: string; excerpt?: string };
};

type XSyncLore = {
  referenced: XEntityRef[];
  created: XEntityRef[];
  heldForReview: XHeldCandidate[];
};

type XStatus = {
  connected: boolean;
  username: string | null;
  providerUserId: string | null;
  scopes: string[];
  expiresAt: string | null;
  lastSyncAt: string | null;
  status: string;
  loreIntakeMode?: LoreIntakeMode;
};

type XSyncResult = {
  count: number;
  imported?: number;
  skipped?: number;
  loreIntakeMode?: LoreIntakeMode;
  lore?: XSyncLore;
};

const INTAKE_MODES: Array<{ value: LoreIntakeMode; label: string; hint: string }> = [
  { value: 'reference_only', label: 'Reference only', hint: 'Posts link to lore you already have. Never creates anything.' },
  { value: 'conservative', label: 'Conservative', hint: 'Links freely; creates at most 2 well-evidenced entities per post.' },
  { value: 'review_first', label: 'Review first', hint: 'Never auto-creates. New candidates wait for your confirmation below.' },
];

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
  const isMock = useShouldUseMockData();
  const [status, setStatus] = useState<XStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);
  const [usingOverride, setUsingOverride] = useState(false);
  const [recentImports, setRecentImports] = useState<Array<{ id: string; content: string; metadata?: any; date: string }>>([]);
  const [intakeMode, setIntakeMode] = useState<LoreIntakeMode>('conservative');
  const [savingMode, setSavingMode] = useState(false);
  const [receipt, setReceipt] = useState<XSyncLore | null>(null);
  const [confirmingName, setConfirmingName] = useState<string | null>(null);

  const saveIntakeMode = async (mode: LoreIntakeMode) => {
    const previous = intakeMode;
    setIntakeMode(mode);
    if (isMock) return;
    setSavingMode(true);
    try {
      await fetchJson('/api/integrations/x/settings', {
        method: 'POST',
        body: JSON.stringify({ loreIntakeMode: mode }),
      });
    } catch (err) {
      setIntakeMode(previous);
      setError(err instanceof Error ? err.message : 'Failed to save lore intake mode');
    } finally {
      setSavingMode(false);
    }
  };

  const addHeldToLore = async (candidate: XHeldCandidate) => {
    setConfirmingName(candidate.name);
    setError(null);
    try {
      if (!isMock) {
        await fetchJson('/api/integrations/x/lore-candidate/confirm', {
          method: 'POST',
          body: JSON.stringify({
            name: candidate.name,
            type: candidate.type,
            provenance: candidate.provenance ?? {},
          }),
        });
      }
      setReceipt((prev) =>
        prev
          ? {
              ...prev,
              heldForReview: prev.heldForReview.filter((c) => c.name !== candidate.name),
              created: [...prev.created, { name: candidate.name, type: candidate.type }],
            }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to add ${candidate.name} to lore`);
    } finally {
      setConfirmingName(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isMock) {
        // Mock X integration for demo mode
        const mockStatus: XStatus = {
          connected: true,
          username: 'demo_user',
          providerUserId: 'demo123',
          scopes: ['tweet.read', 'users.read', 'offline.access'],
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
          lastSyncAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          status: 'connected',
          loreIntakeMode: 'conservative',
        };
        setStatus(mockStatus);
        setIntakeMode(mockStatus.loreIntakeMode ?? 'conservative');

        // Mock recent X posts (as if imported)
        const mockPosts = [
          { id: 'mock-x-1', content: 'Just finished an amazing hike in the mountains. The views were breathtaking! #nature', metadata: { url: 'https://x.com/demo_user/status/1' }, date: new Date(Date.now() - 1000*60*60*5).toISOString() },
          { id: 'mock-x-2', content: 'Working on a new project called LoreBook. Super excited about the AI memory features.', metadata: { url: 'https://x.com/demo_user/status/2' }, date: new Date(Date.now() - 1000*60*60*24).toISOString() },
          { id: 'mock-x-3', content: 'Met up with old friends today. Reminiscing about our college days always makes me smile.', metadata: { url: 'https://x.com/demo_user/status/3' }, date: new Date(Date.now() - 1000*60*60*48).toISOString() },
        ];
        setRecentImports(mockPosts);
        setLoading(false);
        return;
      }

      const next = await fetchJson<XStatus>('/api/integrations/x/status');
      setStatus(next);
      if (next.loreIntakeMode) setIntakeMode(next.loreIntakeMode);

      // Load recent X imports for preview (throughout app visibility)
      if (next?.connected) {
        try {
          const res = await fetchJson<any>(`/api/entries?keyword=x-import&limit=5`);
          const items = (res.entries || res.results || []).map((e: any) => ({
            id: e.id,
            content: e.content || e.summary || '',
            metadata: e.metadata,
            date: e.date || e.created_at,
          }));
          setRecentImports(items);
        } catch {}
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load X connection');
    } finally {
      setLoading(false);
    }
  }, [isMock]);

  const loadCallbackUrl = useCallback(async () => {
    if (isMock) {
      setCallbackUrl('https://demo.lorebook.ai/api/integrations/x/callback');
      return;
    }
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
  }, [isMock]);

  useEffect(() => {
    void load();
    void loadCallbackUrl();
  }, [load, loadCallbackUrl, isMock]);

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
    if (isMock) {
      setWorking(true);
      setError(null);
      setMessage(null);
      setTimeout(() => {
        setStatus({
          connected: true,
          username: 'demo_user',
          providerUserId: 'demo123',
          scopes: ['tweet.read', 'users.read', 'offline.access'],
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
          lastSyncAt: new Date().toISOString(),
          status: 'connected',
        });
        setRecentImports([
          { id: 'mock-x-1', content: 'Just finished an amazing hike in the mountains. The views were breathtaking! #nature', metadata: { url: 'https://x.com/demo_user/status/1' }, date: new Date(Date.now() - 1000*60*60*5).toISOString() },
          { id: 'mock-x-2', content: 'Working on a new project called LoreBook. Super excited about the AI memory features.', metadata: { url: 'https://x.com/demo_user/status/2' }, date: new Date(Date.now() - 1000*60*60*24).toISOString() },
          { id: 'mock-x-3', content: 'Met up with old friends today. Reminiscing about our college days always makes me smile.', metadata: { url: 'https://x.com/demo_user/status/3' }, date: new Date(Date.now() - 1000*60*60*48).toISOString() },
        ]);
        setMessage('Demo mode: X connected (mock data). Imported sample posts will appear in Timeline, Memory Explorer (filter by X), and entity provenance.');
        setWorking(false);
      }, 800);
      return;
    }
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
    if (isMock) {
      setWorking(true);
      setError(null);
      setMessage(null);
      setTimeout(() => {
        const newMock = [
          { id: 'mock-x-4', content: 'Demo post about my latest adventure exploring the city at night. Loved the lights!', metadata: { url: 'https://x.com/demo_user/status/4' }, date: new Date().toISOString() },
          { id: 'mock-x-5', content: 'Reflecting on how technology and memory apps like LoreBook are changing how we remember our lives.', metadata: { url: 'https://x.com/demo_user/status/5' }, date: new Date(Date.now() - 1000*60*30).toISOString() },
        ];
        setRecentImports(prev => [...newMock, ...prev].slice(0, 5));
        // Demo receipt honors the selected intake mode
        const demoCandidate: XHeldCandidate = {
          name: 'Night Market',
          type: 'PLACE',
          provenance: { url: 'https://x.com/demo_user/status/4', excerpt: 'exploring the city at night' },
        };
        setReceipt({
          referenced: [{ name: 'Sarah Chen', type: 'PERSON' }],
          created: intakeMode === 'conservative' ? [demoCandidate] : [],
          heldForReview: intakeMode === 'conservative' ? [] : [demoCandidate],
        });
        setMessage('Demo: Synced 2 more mock X posts. They are now part of your lore with X provenance links in entities and timeline.');
        setWorking(false);
      }, 700);
      return;
    }
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const result = await fetchJson<XSyncResult>('/api/integrations/x/sync', {
        method: 'POST',
        body: JSON.stringify({ maxPosts: 8 }), // latest only to avoid lore overwhelm
      });
      const imported = result.imported ?? result.count;
      const skipped = result.skipped ?? 0;
      setReceipt(result.lore ?? null);
      setMessage(`Synced ${imported} recent X posts${skipped ? `; skipped ${skipped} duplicates` : ''}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync X posts');
    } finally {
      setWorking(false);
    }
  };

  const disconnect = async () => {
    if (isMock) {
      setWorking(true);
      setTimeout(() => {
        setStatus({
          connected: false,
          username: null,
          providerUserId: null,
          scopes: [],
          expiresAt: null,
          lastSyncAt: null,
          status: 'disconnected',
        });
        setRecentImports([]);
        setMessage('Demo: X disconnected (mock).');
        setWorking(false);
      }, 400);
      return;
    }
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
            Import your original posts and replies into LoreBook as personal history (journal entries + entities/relationships via the ER pipeline).
            Full post text is preserved. Any entities referenced or created will be stamped with provenance back to the originating X post (see entity metadata.external_sources and entry metadata).
          </p>

          {/* Guidance for OAuth setup — hidden in demo/mock mode */}
          {!isMock && !loading && !status?.connected && callbackUrl && (
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

          {/* Lore intake mode — how much a sync may create on its own */}
          {status?.connected && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1.5">
                Lore intake {savingMode && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
              </p>
              <div className="flex flex-col gap-1.5 sm:flex-row">
                {INTAKE_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => void saveIntakeMode(mode.value)}
                    disabled={working || savingMode}
                    title={mode.hint}
                    className={`flex-1 rounded-lg border px-2.5 py-2 text-left transition disabled:opacity-60 ${
                      intakeMode === mode.value
                        ? 'border-primary/50 bg-primary/15 text-primary'
                        : 'border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/5 hover:text-white/80'
                    }`}
                  >
                    <span className="block text-xs font-medium">{mode.label}</span>
                    <span className="block text-[10px] leading-tight opacity-70 mt-0.5">{mode.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sync receipt — exactly what the last sync did to your lore */}
          {receipt && (receipt.referenced.length + receipt.created.length + receipt.heldForReview.length > 0) && (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.015] p-3">
              <p className="text-[10px] uppercase tracking-wide text-white/40 mb-2">Last sync — what entered your lore</p>
              {receipt.referenced.length > 0 && (
                <div className="mb-1.5 text-xs">
                  <span className="text-white/45">Referenced existing: </span>
                  {receipt.referenced.map((r) => (
                    <span key={`${r.type}:${r.name}`} className="inline-block mr-1 rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-300">
                      {r.name}
                    </span>
                  ))}
                </div>
              )}
              {receipt.created.length > 0 && (
                <div className="mb-1.5 text-xs">
                  <span className="text-white/45">Created: </span>
                  {receipt.created.map((r) => (
                    <span key={`${r.type}:${r.name}`} className="inline-block mr-1 rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-300">
                      {r.name} <span className="opacity-60 lowercase">({r.type.toLowerCase()})</span>
                    </span>
                  ))}
                </div>
              )}
              {receipt.heldForReview.length > 0 && (
                <div className="text-xs">
                  <span className="text-white/45">Held for your review: </span>
                  <div className="mt-1 space-y-1">
                    {receipt.heldForReview.map((c) => (
                      <div key={`${c.type}:${c.name}`} className="flex items-center gap-2 rounded border border-amber-500/20 bg-amber-500/[0.06] px-2 py-1">
                        <span className="flex-1 text-[11px] text-amber-200 truncate">
                          {c.name} <span className="opacity-60 lowercase">({c.type.toLowerCase()})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void addHeldToLore(c)}
                          disabled={confirmingName !== null}
                          className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                        >
                          {confirmingName === c.name ? 'Adding…' : 'Add to lore'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {receipt.referenced.length === 0 && receipt.created.length === 0 && receipt.heldForReview.length === 0 && (
                <p className="text-xs text-white/40">Nothing lore-worthy in these posts — journal entries saved, no entities touched.</p>
              )}
            </div>
          )}

          {/* Recent X imports preview — surfaces the integration throughout the lore UI */}
          {recentImports.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wide text-white/40 mb-1.5">Recent imports (appear in Timeline, Memory Explorer, Entities with provenance)</p>
              <div className="space-y-1.5">
                {recentImports.slice(0, 3).map((imp) => {
                  const xUrl = imp.metadata?.url;
                  return (
                    <div key={imp.id} className="rounded border border-white/10 bg-white/[0.015] p-2 text-xs flex gap-2">
                      <Twitter className="h-3.5 w-3.5 mt-0.5 text-sky-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-white/80 truncate">{imp.content}</div>
                        {xUrl && (
                          <a href={xUrl} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline text-[10px]">view on X →</a>
                        )}
                      </div>
                    </div>
                  );
                })}
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
              {working ? 'Connecting…' : (isMock ? 'Connect X (demo)' : 'Connect X')}
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
