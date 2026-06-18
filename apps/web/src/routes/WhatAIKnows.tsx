import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, CheckCircle2, Clock, Download, RefreshCw, Sparkles, X,
} from 'lucide-react';
import { useAuth } from '../lib/supabase';
import { fetchJson } from '../lib/api';
import { useShouldUseMockData } from '../hooks/useShouldUseMockData';
import {
  fetchLoreAssets,
  LORE_ASSET_TAB_LABELS,
  type LoreAsset,
  type LoreAssetKind,
  type LoreAssetKindCounts,
  type LoreAssetTruthState,
} from '../api/loreAssets';
import { LoreAssetCard } from '../components/loreAssets/LoreAssetCard';

const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

const MOCK_COUNTS: LoreAssetKindCounts = {
  moment: 3,
  portrait: 4,
  evidence: 1,
  pattern: 2,
  chapter: 0,
  scene: 0,
};

const MOCK_ASSETS: LoreAsset[] = [
  {
    id: 'mock-e1', artifactType: 'journal_entry', assetKind: 'moment',
    displayName: 'Finished the first draft', subtitle: 'Creative milestone',
    truthState: 'CANONICAL', linkedCount: 1, createdAt: ago(4), sourceTable: 'journal_entries',
  },
  {
    id: 'mock-e2', artifactType: 'journal_entry', assetKind: 'moment',
    displayName: 'Morning run — week 3', truthState: 'CANONICAL', linkedCount: 0,
    createdAt: ago(21), sourceTable: 'journal_entries',
  },
  {
    id: 'mock-e3', artifactType: 'journal_entry', assetKind: 'moment',
    displayName: 'The conversation with Maya', truthState: 'CONTEXTUAL', linkedCount: 1,
    createdAt: ago(11), sourceTable: 'journal_entries',
  },
  {
    id: 'mock-ent1', artifactType: 'entity', assetKind: 'portrait',
    displayName: 'Maya', subtitle: 'person', truthState: 'CANONICAL', linkedCount: 3,
    createdAt: ago(60), sourceTable: 'entities',
  },
  {
    id: 'mock-ent2', artifactType: 'entity', assetKind: 'portrait',
    displayName: 'Dr. Chen', subtitle: 'person', truthState: 'CANONICAL', linkedCount: 1,
    createdAt: ago(7), sourceTable: 'entities',
  },
  {
    id: 'mock-i1', artifactType: 'insight', assetKind: 'pattern',
    displayName: 'Late-night creative peak', summary: 'You tend to do your best creative work after 10pm.',
    truthState: 'CANONICAL', linkedCount: 4, createdAt: ago(15), sourceTable: 'insights',
  },
  {
    id: 'mock-f1', artifactType: 'user_file', assetKind: 'evidence',
    displayName: 'resume.pdf', subtitle: 'application/pdf', linkedCount: 12,
    createdAt: ago(30), sourceTable: 'user_files',
  },
];

type GalleryTab = LoreAssetKind | 'stale' | 'audit';

interface RevisePayload {
  fromState: LoreAssetTruthState;
  toState: LoreAssetTruthState;
  artifactType: string;
  rationale?: string;
}

interface MutationRecord {
  id: string;
  artifact_type: string;
  artifact_id: string;
  mutation_type: string;
  rationale: string | null;
  created_at: string;
}

interface ProjectionRefreshResponse {
  refreshed: boolean;
  type: 'biography_snapshot' | 'timeline_event';
  artifactId: string;
  artifact?: LoreAsset;
  message?: string;
}

const TRUTH_STATE_COLORS: Record<LoreAssetTruthState, string> = {
  CANONICAL: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  CONTEXTUAL: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  REVISED: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  DISPUTED: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
  INFERRED: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
  PENDING_VERIFICATION: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20',
};

function TruthBadge({ state }: { state: LoreAssetTruthState }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${TRUTH_STATE_COLORS[state]}`}>
      {state.toLowerCase().replace(/_/g, ' ')}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ReviseModal({
  asset,
  onClose,
  onRevised,
}: {
  asset: LoreAsset;
  onClose: () => void;
  onRevised: () => void;
}) {
  const currentState = asset.truthState ?? 'PENDING_VERIFICATION';
  const [permitted, setPermitted] = useState<LoreAssetTruthState[]>([]);
  const [toState, setToState] = useState<LoreAssetTruthState | ''>('');
  const [rationale, setRationale] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchJson<{ permitted: LoreAssetTruthState[] }>(`/api/identity/permitted-transitions?currentState=${currentState}`)
      .then(r => setPermitted(r.permitted))
      .catch(() => setPermitted([]));
  }, [currentState]);

  const submit = async () => {
    if (!toState) return;
    setSubmitting(true);
    setError('');
    try {
      await fetchJson(`/api/identity/revise/${asset.id}`, {
        method: 'POST',
        body: JSON.stringify({
          fromState: currentState,
          toState,
          artifactType: asset.artifactType,
          rationale,
        } satisfies RevisePayload),
      });
      onRevised();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revision failed');
      setSubmitting(false);
    }
  };

  const needsRationale = toState === 'DISPUTED' || toState === 'REVISED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">Revise truth state</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-zinc-400 text-sm mb-4">
          <span className="text-zinc-300">{asset.displayName}</span> — currently <TruthBadge state={currentState} />.
        </p>
        {permitted.length === 0 ? (
          <p className="text-zinc-500 text-sm">No transitions are permitted from this state.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {permitted.map(s => (
              <button
                key={s}
                onClick={() => setToState(s)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                  toState === s ? 'border-white/40 bg-white/10' : 'border-zinc-700 hover:border-zinc-500'
                }`}
              >
                <TruthBadge state={s} />
              </button>
            ))}
          </div>
        )}
        {needsRationale && (
          <textarea
            placeholder="Explain why this should be revised or disputed…"
            value={rationale}
            onChange={e => setRationale(e.target.value)}
            rows={3}
            className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none mb-4 focus:outline-none focus:border-zinc-400"
          />
        )}
        {error && <p className="text-rose-400 text-sm mb-3">{error}</p>}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
          <button
            onClick={submit}
            disabled={!toState || submitting || (needsRationale && !rationale.trim())}
            className="px-4 py-2 text-sm bg-white text-black rounded-lg font-medium disabled:opacity-40 hover:bg-zinc-200 transition-colors"
          >
            {submitting ? 'Applying…' : 'Apply revision'}
          </button>
        </div>
      </div>
    </div>
  );
}

const GALLERY_TABS: GalleryTab[] = ['moment', 'portrait', 'evidence', 'pattern', 'stale', 'audit'];

export default function WhatAIKnows() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMockData = useShouldUseMockData();

  const [assets, setAssets] = useState<LoreAsset[]>([]);
  const [countsByKind, setCountsByKind] = useState<LoreAssetKindCounts>(MOCK_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<GalleryTab>('moment');
  const [auditLog, setAuditLog] = useState<MutationRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [revising, setRevising] = useState<LoreAsset | null>(null);

  const staleAssets = useMemo(() => assets.filter(a => a.stale), [assets]);

  const visibleAssets = useMemo(() => {
    if (tab === 'stale') return staleAssets;
    if (tab === 'audit') return [];
    return assets.filter(a => a.assetKind === tab);
  }, [assets, tab, staleAssets]);

  const load = useCallback(async () => {
    if (isMockData) {
      setAssets(MOCK_ASSETS);
      setCountsByKind(MOCK_COUNTS);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await fetchLoreAssets({ limit: 500 });
      setAssets(result.assets);
      setCountsByKind(result.countsByKind);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lore assets');
    } finally {
      setLoading(false);
    }
  }, [isMockData]);

  const refreshAsset = useCallback(async (asset: LoreAsset) => {
    if (isMockData) return;
    setRefreshingId(asset.id);
    try {
      await fetchJson<ProjectionRefreshResponse>(`/api/artifacts/${asset.id}/refresh`, {
        method: 'POST',
        body: JSON.stringify({
          type: asset.artifactType,
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshingId(null);
    }
  }, [isMockData, load]);

  const refreshAllStale = useCallback(async () => {
    if (isMockData || staleAssets.length === 0) return;
    setRefreshingAll(true);
    setError('');
    try {
      await fetchJson('/api/artifacts/refresh-stale', {
        method: 'POST',
        body: JSON.stringify({
          items: staleAssets.map(a => ({
            id: a.id,
            type: a.artifactType,
            stale: true,
          })),
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshingAll(false);
    }
  }, [isMockData, staleAssets, load]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const requested = searchParams.get('tab');
    if (requested === 'derived') {
      setTab('stale');
      return;
    }
    if (requested && GALLERY_TABS.includes(requested as GalleryTab)) {
      setTab(requested as GalleryTab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (isMockData || tab !== 'audit' || auditLog.length > 0) return;
    setAuditLoading(true);
    fetchJson<{ mutations: MutationRecord[] }>('/api/identity/audit-log?limit=50')
      .then(r => setAuditLog(r.mutations))
      .catch(() => {})
      .finally(() => setAuditLoading(false));
  }, [tab, auditLog.length, isMockData]);

  const selectTab = (next: GalleryTab) => {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };

  const tabCount = (t: GalleryTab) => {
    if (t === 'stale') return staleAssets.length;
    if (t === 'audit') return null;
    return countsByKind[t as LoreAssetKind] ?? 0;
  };

  if (!user && !isMockData) {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-zinc-800 px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <h1 className="text-xl font-semibold text-white">Lore Assets</h1>
            </div>
            <p className="text-zinc-500 text-sm mt-1">
              Everything in your book — moments, people, files, patterns — with truth states and provenance.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={load} className="p-2 text-zinc-400 hover:text-white transition-colors" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => window.open('/api/identity/export', '_blank')}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-zinc-700 rounded-lg text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex flex-wrap gap-1 mb-6 bg-zinc-900 p-1 rounded-lg w-fit">
          {GALLERY_TABS.map(t => {
            const count = tabCount(t);
            const label = LORE_ASSET_TAB_LABELS[t];
            return (
              <button
                key={t}
                onClick={() => selectTab(t)}
                className={`px-4 py-2 text-sm rounded-md transition-colors ${
                  tab === t ? 'bg-white text-black font-medium' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {count != null ? `${label} (${count})` : label}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-zinc-400 py-16 justify-center">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Opening your lore…</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-lg px-4 py-3 text-sm mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {!loading && tab !== 'audit' && tab === 'stale' && staleAssets.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border border-amber-400/20 rounded-lg bg-amber-400/5 mb-4">
            <p className="text-amber-200/80 text-sm">
              {staleAssets.length} derived summar{staleAssets.length === 1 ? 'y is' : 'ies are'} out of date.
            </p>
            <button
              onClick={refreshAllStale}
              disabled={refreshingAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-amber-400/15 border border-amber-400/25 text-amber-200 hover:bg-amber-400/25 disabled:opacity-50 transition-colors shrink-0"
            >
              <RefreshCw className={`w-3 h-3 ${refreshingAll ? 'animate-spin' : ''}`} />
              {refreshingAll ? 'Refreshing…' : 'Refresh all'}
            </button>
          </div>
        )}

        {!loading && tab !== 'audit' && (
          <div className="space-y-2">
            {visibleAssets.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-zinc-600">
                <Sparkles className="w-8 h-8" />
                <p className="text-sm text-center max-w-sm">
                  {tab === 'stale'
                    ? 'All summaries are in sync with your memories.'
                    : `No ${LORE_ASSET_TAB_LABELS[tab as LoreAssetKind].toLowerCase()} yet. Chat, write, or upload to grow your lore.`}
                </p>
              </div>
            ) : (
              visibleAssets.map(asset => (
                <LoreAssetCard
                  key={`${asset.artifactType}-${asset.id}`}
                  asset={asset}
                  onRevise={asset.truthState ? setRevising : undefined}
                  onRefresh={refreshAsset}
                  refreshing={refreshingId === asset.id || refreshingAll}
                />
              ))
            )}
          </div>
        )}

        {tab === 'audit' && (
          <div className="space-y-2">
            {auditLoading && (
              <div className="flex items-center gap-3 text-zinc-400 py-12 justify-center">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading audit log…</span>
              </div>
            )}
            {!auditLoading && auditLog.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-16 text-zinc-600">
                <CheckCircle2 className="w-8 h-8" />
                <p className="text-sm">No truth revisions recorded yet.</p>
              </div>
            )}
            {auditLog.map(m => (
              <div key={m.id} className="flex items-start gap-3 px-4 py-3 border border-zinc-800 rounded-lg bg-zinc-900/50">
                <Clock className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-300 text-sm font-medium">{m.mutation_type}</span>
                    <span className="text-zinc-600 text-xs">{m.artifact_type}</span>
                  </div>
                  {m.rationale && <p className="text-zinc-500 text-xs mt-1">{m.rationale}</p>}
                </div>
                <span className="text-zinc-600 text-xs shrink-0">{formatDate(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {revising && (
        <ReviseModal
          asset={revising}
          onClose={() => setRevising(null)}
          onRevised={load}
        />
      )}
    </div>
  );
}
