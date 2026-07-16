import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Loader2, RefreshCw, Twitter } from 'lucide-react';

import { fetchJson } from '../../lib/api';
import { cn } from '../../lib/cn';
import { xStatusHref } from '../../lib/safeUrl';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';

type XStatus = {
  connected: boolean;
  username: string | null;
  lastSyncAt: string | null;
};

type RecentImport = {
  id: string;
  content: string;
  date: string;
  metadata?: { sourceId?: string; url?: string };
};

function formatRelative(value?: string | null) {
  if (!value) return 'Never synced';
  const ms = Date.now() - new Date(value).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 36) return `${hours}h ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Compact Home surface for X → LoreBook.
 * Connect CTA when disconnected; live pulse + one-tap sync when connected.
 */
export function XPulseHomeCard() {
  const navigate = useNavigate();
  const isMock = useShouldUseMockData();
  const [status, setStatus] = useState<XStatus | null>(null);
  const [recent, setRecent] = useState<RecentImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isMock) {
        setStatus({
          connected: true,
          username: 'demo_user',
          lastSyncAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        });
        setRecent([
          {
            id: 'mock-1',
            content: 'Sunset walk by the pier — need to remember how quiet it felt.',
            date: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
            metadata: { sourceId: '1840000000000000001', url: 'https://x.com/demo_user/status/1840000000000000001' },
          },
          {
            id: 'mock-2',
            content: 'Shipped a small win on MemoVault tonight. Tiny commits, big mood.',
            date: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
            metadata: { sourceId: '1840000000000000002' },
          },
        ]);
        return;
      }

      const next = await fetchJson<XStatus>('/api/integrations/x/status');
      setStatus(next);
      if (next.connected) {
        try {
          const res = await fetchJson<{ entries?: any[]; results?: any[] }>(
            '/api/entries?keyword=x-import&limit=4'
          );
          const items = (res.entries || res.results || []).map((e: any) => ({
            id: e.id,
            content: e.content || e.summary || '',
            date: e.date || e.created_at,
            metadata: e.metadata,
          }));
          setRecent(items);
        } catch {
          setRecent([]);
        }
      } else {
        setRecent([]);
      }
    } catch {
      setStatus({ connected: false, username: null, lastSyncAt: null });
    } finally {
      setLoading(false);
    }
  }, [isMock]);

  useEffect(() => {
    void load();
    const onSynced = () => void load();
    window.addEventListener('lorebook:x-synced', onSynced);
    return () => window.removeEventListener('lorebook:x-synced', onSynced);
  }, [load]);

  const sync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (syncing) return;
    setSyncing(true);
    setFlash(null);
    try {
      if (isMock) {
        await new Promise((r) => setTimeout(r, 600));
        setFlash('Caught up — 1 new post in your journal');
        setStatus((s) => (s ? { ...s, lastSyncAt: new Date().toISOString() } : s));
        return;
      }
      const result = await fetchJson<{ imported?: number; skipped?: number }>('/api/integrations/x/sync', {
        method: 'POST',
        body: JSON.stringify({ maxPosts: 50 }),
      });
      const imported = result.imported ?? 0;
      setFlash(
        imported === 0
          ? 'All caught up — nothing new on X'
          : `Brought in ${imported} new post${imported === 1 ? '' : 's'}`
      );
      await load();
      window.dispatchEvent(new CustomEvent('lorebook:x-synced', { detail: result }));
    } catch {
      setFlash("Couldn't reach X — try again in a minute");
    } finally {
      setSyncing(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="rounded-2xl border border-white/8 bg-black/20 p-5 flex items-center gap-2 text-sm text-white/40">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking X…
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <button
        type="button"
        onClick={() => navigate('/account')}
        className={cn(
          'group w-full rounded-2xl border border-dashed border-sky-500/30 bg-gradient-to-br from-sky-500/[0.07] via-black/30 to-cyan-500/[0.04] p-5 text-left',
          'transition-all hover:border-sky-400/45 hover:from-sky-500/12'
        )}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-sky-500/15 p-2.5 ring-1 ring-sky-400/25">
            <Twitter className="h-5 w-5 text-sky-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-300/70">Your timeline</p>
            <p className="mt-1 text-sm font-medium text-white">Turn posts into lore</p>
            <p className="mt-0.5 text-xs text-white/45 leading-relaxed">
              Connect X and your newest posts land in your journal — people and places link themselves.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-white/25 shrink-0 mt-1 group-hover:text-sky-300 transition" />
        </div>
      </button>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-950/40 via-black/35 to-cyan-950/20 p-5',
        'shadow-[inset_0_1px_0_rgba(125,211,252,0.08)]'
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <button
          type="button"
          onClick={() => navigate('/account')}
          className="flex items-center gap-2 text-left min-w-0 group"
        >
          <div className="rounded-lg bg-sky-500/15 p-1.5 ring-1 ring-sky-400/30">
            <Twitter className="h-4 w-4 text-sky-300" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">From X</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                <CheckCircle2 className="h-2.5 w-2.5" />
                @{status.username ?? 'you'}
              </span>
            </div>
            <p className="text-[11px] text-white/40 mt-0.5">
              Synced {formatRelative(status.lastSyncAt)}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={sync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-60 transition"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {syncing ? 'Syncing…' : 'Sync'}
        </button>
      </div>

      {flash && (
        <p className="mb-2.5 text-[11px] text-sky-200/90 rounded-lg border border-sky-500/20 bg-sky-500/10 px-2.5 py-1.5">
          {flash}
        </p>
      )}

      {recent.length > 0 ? (
        <ul className="space-y-2">
          {recent.slice(0, 3).map((item) => {
            const href = xStatusHref({
              sourceId: item.metadata?.sourceId,
              url: item.metadata?.url,
            });
            return (
              <li
                key={item.id}
                className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5"
              >
                <p className="text-xs text-white/80 line-clamp-2 leading-relaxed">{item.content}</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-white/35">{formatRelative(item.date)}</span>
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-sky-400 hover:text-sky-300 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open on X →
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-white/45">
          Connected — hit Sync to pull your latest posts into LoreBook.
        </p>
      )}

      <button
        type="button"
        onClick={() => navigate('/account')}
        className="mt-3 text-[11px] text-sky-300/80 hover:text-sky-200 inline-flex items-center gap-1"
      >
        Manage X in Account <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}
