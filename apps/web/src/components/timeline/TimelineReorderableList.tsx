/**
 * Drag / button reorder for stitched timeline items.
 */

import { useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { StitchedTimelineItem } from '../../api/stitchedTimeline';
import { formatEventDateShort, formatEventTime } from './timelineEventUtils';

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
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-white/40">
          Drag or use arrows to fix order · saves help LoreBook learn your chronology
        </p>
        {dirty && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-medium hover:bg-primary/30 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save order'}
          </button>
        )}
      </div>

      <ol className="space-y-2">
        {items.map((item, index) => {
          const selected = selectedId === item.id;
          const time = formatEventTime(item.sortTime);
          const KindIcon = item.kind === 'event' ? Zap : Sparkles;

          return (
            <li
              key={item.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(index)}
              className={`flex items-stretch gap-1 rounded-xl border transition-colors ${
                dragIndex === index ? 'opacity-50 border-primary/40' : 'border-white/10'
              } ${selected ? 'bg-primary/10 border-primary/40' : 'bg-white/[0.03]'}`}
            >
              <div className="flex flex-col items-center justify-center px-1 py-2 text-white/25">
                <GripVertical className="h-4 w-4 cursor-grab active:cursor-grabbing" />
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="p-1 hover:text-white disabled:opacity-20"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                  className="p-1 hover:text-white disabled:opacity-20"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => onSelect(item)}
                className="flex-1 text-left px-3 py-3 min-w-0 touch-manipulation"
              >
                <div className="flex items-center gap-2 flex-wrap mb-1">
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
                  <span className="text-sm font-bold text-white flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-primary/70" />
                    {formatEventDateShort(item.sortTime)}
                    {time && <span className="text-[10px] font-normal text-white/35">· {time}</span>}
                  </span>
                  {item.userPresence === 'heard_about' && (
                    <span className="text-[10px] text-amber-300/90 border border-amber-500/30 px-1 rounded">
                      Heard about
                    </span>
                  )}
                  {item.temporalRole && item.temporalRole !== 'during' && (
                    <span className="text-[10px] text-white/30 capitalize">{item.temporalRole}</span>
                  )}
                </div>
                <p className="text-sm font-medium text-white/90 line-clamp-1">{item.title}</p>
                {item.body && item.body !== item.title && (
                  <p className="text-xs text-white/50 mt-1 line-clamp-2">{item.body}</p>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
