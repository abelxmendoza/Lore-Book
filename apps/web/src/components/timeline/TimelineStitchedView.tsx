/**
 * Stitched timeline: moments + events in one chronological stream, user-reorderable.
 */

import { useState } from 'react';
import { X, Layers } from 'lucide-react';
import { useEntityModal } from '../../contexts/EntityModalContext';
import { useStitchedTimeline } from '../../hooks/useStitchedTimeline';
import type { StitchedTimelineItem } from '../../api/stitchedTimeline';
import { TimelineReorderableList } from './TimelineReorderableList';
import { formatEventDateShort } from './timelineEventUtils';

type TimelineStitchedViewProps = {
  lifeArcId?: string;
  scopeLabel?: string | null;
  onClose?: () => void;
  embedded?: boolean;
  /** Hide title bar when nested inside another panel (e.g. swimlanes strip) */
  hideHeader?: boolean;
};

export const TimelineStitchedView = ({
  lifeArcId,
  scopeLabel,
  onClose,
  embedded = false,
  hideHeader = false,
}: TimelineStitchedViewProps) => {
  const { openMemory } = useEntityModal();
  const {
    data,
    items,
    loading,
    saving,
    error,
    reorderItems,
    persistOrder,
  } = useStitchedTimeline({
    life_arc_id: lifeArcId,
    scope_type: lifeArcId ? 'life_arc' : 'global',
  });

  const [selected, setSelected] = useState<StitchedTimelineItem | null>(null);

  const handleSelect = (item: StitchedTimelineItem) => {
    setSelected(item);
    if (item.kind === 'moment') {
      openMemory({
        id: item.sourceId,
        journal_entry_id: item.sourceId,
        content: item.body,
        start_time: item.sortTime,
        date: item.sortTime,
      });
    }
  };

  const title =
    scopeLabel ??
    data?.scope_label ??
    (lifeArcId ? 'Life arc timeline' : 'Your full timeline');

  const shell = embedded
    ? 'h-full flex flex-col min-h-0'
    : 'fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md';

  return (
    <div className={shell} style={embedded ? undefined : { paddingTop: 'env(safe-area-inset-top)' }}>
      {!hideHeader && (
        <div className="flex-shrink-0 flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-white/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary/80 mb-1">
              <Layers className="h-4 w-4" />
              <span className="text-[10px] uppercase tracking-widest font-mono">Stitched timeline</span>
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-white truncate">{title}</h2>
            <p className="text-xs text-white/40 mt-0.5">
              {loading
                ? 'Loading…'
                : `${items.length} item${items.length !== 1 ? 's' : ''} · moments & events woven together`}
              {data?.has_user_order && !loading && ' · custom order saved'}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-white/10 text-white/50 hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      <div className={`flex-1 min-h-0 overflow-y-auto ${hideHeader ? 'px-3 sm:px-4 py-3' : 'px-4 sm:px-6 py-4'}`}>
        {error && <p className="text-sm text-red-400/90 mb-3">{error}</p>}
        {loading ? (
          <div className="py-16 text-center text-white/40 text-sm animate-pulse">Stitching timeline…</div>
        ) : (
          <TimelineReorderableList
            items={items}
            selectedId={selected?.id}
            saving={saving}
            onSelect={handleSelect}
            onReorder={reorderItems}
            onSaveOrder={persistOrder}
          />
        )}
      </div>

      {selected && selected.kind === 'event' && (
        <div className="flex-shrink-0 border-t border-white/10 px-4 sm:px-6 py-3 bg-black/90 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="text-sm font-bold text-white">{formatEventDateShort(selected.sortTime)}</p>
          <p className="text-sm text-white/70 mt-1">{selected.title}</p>
          {selected.body && (
            <p className="text-xs text-white/50 mt-1 line-clamp-3">{selected.body}</p>
          )}
        </div>
      )}
    </div>
  );
};
