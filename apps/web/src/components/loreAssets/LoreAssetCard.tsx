import {
  BookOpen, Brain, FileText, GitMerge, Layers, RefreshCw, User,
} from 'lucide-react';
import type { LoreAsset, LoreAssetKind } from '../../api/loreAssets';

const TRUTH_STATE_COLORS: Record<string, string> = {
  CANONICAL: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  CONTEXTUAL: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  REVISED: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  DISPUTED: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
  INFERRED: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
  PENDING_VERIFICATION: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20',
};

const KIND_ICONS: Record<LoreAssetKind, typeof BookOpen> = {
  moment: BookOpen,
  portrait: User,
  evidence: FileText,
  pattern: Brain,
  chapter: Layers,
  scene: GitMerge,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function TruthBadge({ state }: { state?: string }) {
  const s = state ?? 'PENDING_VERIFICATION';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${TRUTH_STATE_COLORS[s] ?? TRUTH_STATE_COLORS.PENDING_VERIFICATION}`}>
      {(s ?? 'PENDING_VERIFICATION').toLowerCase().replace(/_/g, ' ')}
    </span>
  );
}

export type LoreAssetCardProps = {
  asset: LoreAsset;
  onRevise?: (asset: LoreAsset) => void;
  onRefresh?: (asset: LoreAsset) => void;
  refreshing?: boolean;
};

export function LoreAssetCard({ asset, onRevise, onRefresh, refreshing }: LoreAssetCardProps) {
  const Icon = KIND_ICONS[asset.assetKind];
  const canRefresh =
    asset.stale &&
    (asset.artifactType === 'biography_snapshot' || asset.artifactType === 'timeline_event');

  return (
    <div
      className="flex gap-3 px-4 py-3 border border-zinc-800 rounded-lg bg-zinc-900/50 group hover:border-zinc-700 transition-colors"
      data-testid={`lore-asset-${asset.id}`}
    >
      <div className="shrink-0 mt-0.5">
        {asset.thumbnailUrl ? (
          <img
            src={asset.thumbnailUrl}
            alt=""
            className="w-10 h-10 rounded-lg object-cover border border-zinc-700"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <Icon className="w-4 h-4 text-zinc-400" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white text-sm font-medium truncate">{asset.displayName}</span>
          {asset.truthState && <TruthBadge state={asset.truthState} />}
          {asset.stale && (
            <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium text-amber-400 bg-amber-400/10 border-amber-400/20">
              needs refresh
            </span>
          )}
        </div>

        {asset.subtitle && (
          <p className="text-zinc-500 text-xs mt-1 truncate">{asset.subtitle}</p>
        )}

        {asset.summary && asset.assetKind !== 'moment' && (
          <p className="text-zinc-400 text-sm mt-1 leading-relaxed line-clamp-2">{asset.summary}</p>
        )}

        <div className="flex items-center gap-3 mt-2 text-xs text-zinc-600">
          <span>{formatDate(asset.createdAt)}</span>
          {asset.linkedCount > 0 && (
            <span>{asset.linkedCount} linked</span>
          )}
          {asset.lastUsedInChat && (
            <span>used {formatDate(asset.lastUsedInChat)}</span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-2">
          {onRevise && asset.truthState && (
            <button
              onClick={() => onRevise(asset)}
              className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors underline underline-offset-2 opacity-0 group-hover:opacity-100"
            >
              revise truth
            </button>
          )}
          {canRefresh && onRefresh && (
            <button
              onClick={() => onRefresh(asset)}
              disabled={refreshing}
              className="inline-flex items-center gap-1 text-xs text-amber-300/90 hover:text-amber-200 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
