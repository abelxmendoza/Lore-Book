import type { EntitySearchResult } from '../../../api/entitySearch';
import { ENTITY_SEARCH_TYPE_LABELS } from '../../../api/entitySearch';

type EntitySearchResultCardProps = {
  result: EntitySearchResult;
  selected?: boolean;
  onSelect: (result: EntitySearchResult) => void;
};

function matchLabel(kind?: string): string {
  if (kind === 'exact') return 'Exact match';
  if (kind === 'alias') return 'Alias match';
  if (kind === 'fuzzy') return 'Fuzzy match';
  return 'Match';
}

export function EntitySearchResultCard({
  result,
  selected = false,
  onSelect,
}: EntitySearchResultCardProps) {
  const typeLabel = ENTITY_SEARCH_TYPE_LABELS[result.entityType] ?? result.entityType;
  const known = result.knownStatus === 'known';

  return (
    <button
      type="button"
      data-testid={`entity-search-result-${result.entityId}`}
      onClick={() => onSelect(result)}
      className={`w-full text-left rounded-lg border px-2.5 py-2 transition-colors ${
        selected
          ? 'border-violet-400/60 bg-violet-500/15'
          : 'border-white/10 bg-white/5 hover:bg-white/8'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-white truncate">{result.displayName}</p>
          <p className="text-[10px] text-white/45 mt-0.5">
            {typeLabel}
            {result.subtitle ? ` · ${result.subtitle}` : ''}
          </p>
          {result.aliases.length > 0 && (
            <p className="text-[10px] text-white/35 mt-0.5 truncate">
              aka {result.aliases.slice(0, 3).join(', ')}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span
            className={`inline-flex px-1.5 py-0.5 rounded text-[9px] ${
              known
                ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
                : 'border border-dashed border-white/25 text-white/50'
            }`}
          >
            {known ? 'Known' : 'Suggestion'}
          </span>
          <p className="text-[9px] text-white/35 mt-1">{matchLabel(result.matchKind)}</p>
        </div>
      </div>
    </button>
  );
}
