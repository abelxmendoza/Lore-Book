/**
 * Drag / button reorder for stitched timeline items.
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { StitchedTimelineItem } from '../../api/stitchedTimeline';
import { TimelineDateHeader, TimelineInlineDate } from './TimelineDateDisplay';

type TimelineReorderableListProps = {
  items: StitchedTimelineItem[];
  selectedId?: string | null;
  saving?: boolean;
  onSelect: (item: StitchedTimelineItem) => void;
  onReorder: (items: StitchedTimelineItem[]) => void;
  onSaveOrder: (items: StitchedTimelineItem[]) => Promise<void>;
};

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list;
  }
  const next = [...list];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

export const TimelineReorderableList = ({
  items,
  selectedId,
  saving,
  onSelect,
  onReorder,
  onSaveOrder,
}: TimelineReorderableListProps) => {
  const isMobile = useIsMobile();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  const applyReorder = (next: StitchedTimelineItem[]) => {
    onReorder(next);
    setDirty(true);
  };

  const move = (index: number, direction: -1 | 1) => {
    applyReorder(moveItem(items, index, index + direction));
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex == null || dragIndex === targetIndex) return;
    applyReorder(moveItem(items, dragIndex, targetIndex));
    setDragIndex(null);
  };

  const save = async () => {
    await onSaveOrder(items);
    setDirty(false);
  };

  if (items.length === 0) {
    return (
      <p className="text-sm text-white/40 text-center py-12">
        No moments or events in this timeline yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1 sticky top-0 z-10 py-1 bg-black/80 backdrop-blur-sm sm:static sm:bg-transparent sm:backdrop-blur-none">
        <p className="hidden sm:block text-[11px] text-white/40">
          Drag or use arrows to fix order · saves help LoreBook learn your chronology
        </p>
        {dirty && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="ml-auto sm:ml-0 shrink-0 px-4 py-2 sm:py-1.5 rounded-xl sm:rounded-lg bg-primary text-white sm:bg-primary/20 sm:text-primary sm:border sm:border-primary/40 text-xs font-semibold sm:font-medium active:bg-primary/90 sm:hover:bg-primary/30 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save order'}
          </button>
        )}
      </div>

      <ol className="space-y-2.5 sm:space-y-2">
        {items.map((item, index) => {
          const selected = selectedId === item.id;
          const dateKey = item.sortTime.slice(0, 10);
          const prevDateKey = index > 0 ? items[index - 1].sortTime.slice(0, 10) : null;
          const showDateHeader = dateKey !== prevDateKey;
          const KindIcon = item.kind === 'event' ? Zap : Sparkles;

          return (
            <li key={item.id} className="list-none">
              {showDateHeader && (
                <TimelineDateHeader dateKey={dateKey} sticky={false} className="mx-0 mb-2 rounded-xl overflow-hidden" />
              )}
              <div
                draggable={!isMobile}
                onDragStart={() => !isMobile && setDragIndex(index)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(index)}
                className={`flex items-stretch gap-0 rounded-xl border transition-colors overflow-hidden ${
                  dragIndex === index ? 'opacity-50 border-primary/40' : 'border-white/10'
                } ${selected ? 'bg-primary/10 border-primary/40' : 'bg-white/[0.03]'}`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className="flex-1 text-left px-3 py-3 min-w-0 touch-manipulation flex gap-3"
                >
                  <TimelineInlineDate iso={item.sortTime} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          item.kind === 'event'
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
                        }`}
                      >
                        <KindIcon className="h-3 w-3" />
                        {item.kind === 'event' ? 'Event' : 'Moment'}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-white/90 line-clamp-2 sm:line-clamp-1">{item.title}</p>
                    {item.body && item.body !== item.title && (
                      <p className="text-xs text-white/50 mt-1 line-clamp-2">{item.body}</p>
                    )}
                  </div>
                </button>

                <div className={`flex flex-col items-center justify-center border-l border-white/8 text-white/30 ${isMobile ? 'px-1' : 'px-1 py-2'}`}>
                  {!isMobile && <GripVertical className="h-4 w-4 mb-0.5 cursor-grab active:cursor-grabbing" />}
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="p-2 sm:p-1 active:bg-white/10 rounded-lg disabled:opacity-20 touch-manipulation"
                  >
                    <ChevronUp className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                    className="p-2 sm:p-1 active:bg-white/10 rounded-lg disabled:opacity-20 touch-manipulation"
                  >
                    <ChevronDown className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
