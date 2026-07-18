/**
 * Stitched timeline item list.
 *
 * Read mode (default): cards open their memory/event on click, text is
 * selectable for copy-paste, and nothing can be dragged — reordering is locked
 * behind an explicit "Reorder" toggle so a sloppy click can't move items.
 * Reorder mode: drag (desktop) or arrow buttons, then save.
 *
 * "Copy all" exports every item as plain text (date · kind · title · body)
 * for debugging chronology or pasting into another assistant.
 */

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
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

/** Plain-text export of the stitched timeline, one item per line. */
export function buildTimelineClipboardText(items: StitchedTimelineItem[]): string {
  return items
    .map((item) => {
      const date = item.sortTime.slice(0, 10);
      const kind = item.kind === 'event' ? 'Event' : 'Moment';
      const cohesion = item.cohesion != null ? ` [cohesion ${item.cohesion}]` : '';
      const body = item.body && item.body !== item.title ? `\n  ${item.body}` : '';
      const merged = item.mergedTitles?.length
        ? `\n  (merged duplicates: ${item.mergedTitles.join(' · ')})`
        : '';
      return `${date} · ${kind} · ${item.title}${cohesion}${body}${merged}`;
    })
    .join('\n');
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
  const [reorderMode, setReorderMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

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

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(buildTimelineClipboardText(items));
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy timeline to clipboard:', error);
    }
  };

  const handleCardClick = (item: StitchedTimelineItem) => {
    // Don't hijack a copy gesture: if the user just highlighted text inside
    // the card, the mouseup fires click — let them keep their selection.
    if (window.getSelection()?.toString()) return;
    onSelect(item);
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
        <p className="hidden sm:block text-[11px] text-white/40 min-w-0 truncate">
          {reorderMode
            ? 'Drag or use arrows to fix order · saves help LoreBook learn your chronology'
            : 'Tap to open · highlight text to copy it'}
        </p>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {dirty && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="px-4 py-2 sm:py-1.5 rounded-xl sm:rounded-lg bg-primary text-white sm:bg-primary/20 sm:text-primary sm:border sm:border-primary/40 text-xs font-semibold sm:font-medium active:bg-primary/90 sm:hover:bg-primary/30 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save order'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void copyAll()}
            title="Copy every item as plain text — for debugging or pasting elsewhere"
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 sm:py-1.5 rounded-lg border text-xs font-medium transition-colors touch-manipulation ${
              copied
                ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                : 'border-white/10 text-white/60 hover:text-white hover:border-white/25'
            }`}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy all'}
          </button>
          <button
            type="button"
            onClick={() => setReorderMode((v) => !v)}
            aria-pressed={reorderMode ? 'true' : 'false'}
            title={reorderMode ? 'Lock order (back to reading mode)' : 'Unlock reordering'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 sm:py-1.5 rounded-lg border text-xs font-medium transition-colors touch-manipulation ${
              reorderMode
                ? 'border-primary/50 text-primary bg-primary/15'
                : 'border-white/10 text-white/60 hover:text-white hover:border-white/25'
            }`}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {reorderMode ? 'Done' : 'Reorder'}
          </button>
        </div>
      </div>

      <ol className="space-y-2.5 sm:space-y-2">
        {items.map((item, index) => {
          const selected = selectedId === item.id;
          const dateKey = item.sortTime.slice(0, 10);
          const prevDateKey = index > 0 ? items[index - 1].sortTime.slice(0, 10) : null;
          const showDateHeader = dateKey !== prevDateKey;
          const KindIcon = item.kind === 'event' ? Zap : Sparkles;
          const canDrag = reorderMode && !isMobile;

          return (
            <li key={item.id} className="list-none">
              {showDateHeader && (
                <TimelineDateHeader dateKey={dateKey} sticky={false} className="mx-0 mb-2 rounded-xl overflow-hidden" />
              )}
              <div
                draggable={canDrag}
                onDragStart={canDrag ? () => setDragIndex(index) : undefined}
                onDragEnd={canDrag ? () => setDragIndex(null) : undefined}
                onDragOver={reorderMode ? (e) => e.preventDefault() : undefined}
                onDrop={reorderMode ? () => handleDrop(index) : undefined}
                className={`flex items-stretch gap-0 rounded-xl border transition-colors overflow-hidden ${
                  dragIndex === index ? 'opacity-50 border-primary/40' : 'border-white/10'
                } ${selected ? 'bg-primary/10 border-primary/40' : 'bg-white/[0.03]'}`}
              >
                <button
                  type="button"
                  onClick={() => handleCardClick(item)}
                  className={`flex-1 text-left px-3 py-3 min-w-0 touch-manipulation flex gap-3 ${
                    reorderMode ? 'select-none cursor-grab' : 'select-text'
                  }`}
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
                      {(item.mergedCount ?? 0) > 1 && (
                        <span
                          title={`Collapsed ${item.mergedCount} duplicate summaries of the same occurrence:\n${(item.mergedTitles ?? []).join('\n')}`}
                          className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30"
                        >
                          ×{item.mergedCount} merged
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-white/90 line-clamp-2 sm:line-clamp-1">{item.title}</p>
                    {item.body && item.body !== item.title && (
                      <p className="text-xs text-white/50 mt-1 line-clamp-2">{item.body}</p>
                    )}
                  </div>
                </button>

                {reorderMode && (
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
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
