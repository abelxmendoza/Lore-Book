import { useMemo, useState } from 'react';
import type { CorrectedPreviewSpan, EntityCorrectionAction } from '../../../lib/entityCorrectionTypes';
import { useEntitySearch } from '../../../hooks/useEntitySearch';
import {
  ALL_ENTITY_SEARCH_TYPES,
  ENTITY_SEARCH_TYPE_LABELS,
  previewTypeToSearchTypes,
  type EntitySearchResult,
  type EntitySearchType,
} from '../../../api/entitySearch';
import { EntitySearchResultCard } from './EntitySearchResultCard';
import { EntityLinkConfirmation } from './EntityLinkConfirmation';

type EntityLinkPickerProps = {
  span: CorrectedPreviewSpan;
  onAction: (action: EntityCorrectionAction) => void;
  onClose: () => void;
};

export function EntityLinkPicker({ span, onAction, onClose }: EntityLinkPickerProps) {
  const defaultTypes = useMemo(
    () => previewTypeToSearchTypes(span.correctedType ?? span.originalType),
    [span.correctedType, span.originalType]
  );

  const [query, setQuery] = useState(span.text);
  const [typeFilter, setTypeFilter] = useState<EntitySearchType[]>(defaultTypes);
  const [pending, setPending] = useState<EntitySearchResult | null>(null);

  const { results, loading, error } = useEntitySearch({
    query,
    types: typeFilter,
    previewType: span.correctedType ?? span.originalType,
    enabled: !pending,
  });

  const toggleType = (type: EntitySearchType) => {
    setTypeFilter((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleConfirmLink = () => {
    if (!pending) return;
    onAction({
      kind: 'link_existing',
      spanId: span.id,
      entityId: pending.entityId,
      entityName: pending.displayName,
      entityType: pending.entityType,
      source: 'composer',
    });
    onClose();
  };

  if (pending) {
    return (
      <EntityLinkConfirmation
        spanText={span.text}
        result={pending}
        onConfirm={handleConfirmLink}
        onCancel={() => setPending(null)}
      />
    );
  }

  return (
    <div className="space-y-2" data-testid="entity-link-picker">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-white/40 uppercase tracking-wide">Link to existing</p>
        <button
          type="button"
          data-testid="entity-link-picker-cancel"
          onClick={onClose}
          className="text-[10px] text-white/45 hover:text-white/70"
        >
          Cancel
        </button>
      </div>

      <input
        data-testid="entity-link-search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search LoreBook…"
        className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-white text-xs"
        autoFocus
      />

      <div className="flex flex-wrap gap-1" data-testid="entity-link-type-filters">
        {ALL_ENTITY_SEARCH_TYPES.map((type) => {
          const active = typeFilter.includes(type);
          return (
            <button
              key={type}
              type="button"
              data-testid={`entity-link-type-${type}`}
              onClick={() => toggleType(type)}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                active
                  ? 'bg-violet-500/20 text-violet-200 border border-violet-500/35'
                  : 'bg-white/6 text-white/50 border border-transparent'
              }`}
            >
              {ENTITY_SEARCH_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>

      {loading && <p className="text-[10px] text-white/40">Searching…</p>}
      {error && <p className="text-[10px] text-red-300/80">{error}</p>}

      <div className="max-h-44 overflow-y-auto space-y-1.5">
        {results.length === 0 && !loading && query.trim() && (
          <p className="text-[10px] text-white/40">No matches — try another type or spelling.</p>
        )}
        {results.map((result) => (
          <EntitySearchResultCard
            key={`${result.entityType}:${result.entityId}`}
            result={result}
            onSelect={setPending}
          />
        ))}
      </div>
    </div>
  );
}
