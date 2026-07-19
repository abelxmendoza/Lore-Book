/**
 * Stitched timeline: moments + events in one chronological stream, user-reorderable.
 */

import { BookOpen, CheckCircle2, Layers, Target, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import type { NarrativeChapter, StitchedTimelineItem } from '../../api/stitchedTimeline';
import { useEntityModal } from '../../contexts/EntityModalContext';
import { useMockData } from '../../contexts/MockDataContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useStitchedTimeline } from '../../hooks/useStitchedTimeline';
import { isBackendConnectionError } from '../../lib/backendErrorDisplay';
import { sortStitchedItemsNewestFirst } from '../../lib/unifiedTimeline';
import { MobileBottomSheet } from '../ui/MobileBottomSheet';

import { TimelineInlineDate } from './TimelineDateDisplay';
import { TimelineReorderableList } from './TimelineReorderableList';

type TimelineStitchedViewProps = {
  lifeArcId?: string;
  scopeLabel?: string | null;
  onClose?: () => void;
  embedded?: boolean;
  /** Hide title bar when nested inside another panel (e.g. swimlanes strip) */
  hideHeader?: boolean;
  /** Show recent events first while retaining canonical ordering elsewhere. */
  newestFirst?: boolean;
};

function chapterTimeLabel(chapter: NarrativeChapter): string | null {
  if (!chapter.startDate) return null;
  const format = (date: string) => new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
  const start = format(chapter.startDate);
  const end = chapter.endDate ? format(chapter.endDate) : start;
  return start === end ? start : `${start} – ${end}`;
}

export const TimelineStitchedView = ({
  lifeArcId,
  scopeLabel,
  onClose,
  embedded = false,
  hideHeader = false,
  newestFirst = false,
}: TimelineStitchedViewProps) => {
  const isMobile = useIsMobile();
  const { backendUnavailable } = useMockData();
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
    scope_label: scopeLabel,
  });

  const [selected, setSelected] = useState<StitchedTimelineItem | null>(null);
  const displayedItems = useMemo(
    () => newestFirst
      ? sortStitchedItemsNewestFirst(items)
      : items,
    [items, newestFirst],
  );

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

  const displayError =
    error && !(backendUnavailable && isBackendConnectionError(error))
      ? (isMobile && isBackendConnectionError(error) ? 'Could not load — offline' : error)
      : null;
  const chapterDate = data?.chapter ? chapterTimeLabel(data.chapter) : null;

  useEffect(() => {
    if (embedded || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [embedded]);

  useEffect(() => {
    if (embedded || !onClose || typeof document === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [embedded, onClose]);

  const content = (
    <div
      className={shell}
      style={embedded ? undefined : { paddingTop: 'env(safe-area-inset-top)' }}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-label={embedded ? undefined : `${title} stitched timeline`}
      data-testid={embedded ? 'timeline-stitched-embedded-view' : 'timeline-stitched-overlay'}
    >
      {!hideHeader && (
        <div className={`flex-shrink-0 flex items-start justify-between gap-3 border-b border-white/10 ${embedded ? 'px-3 py-3 sm:px-6 sm:py-4' : 'px-4 py-4 sm:px-6'}`}>
          <div className="min-w-0">
            {!embedded && (
              <div className="flex items-center gap-2 text-primary/80 mb-1">
                <Layers className="h-4 w-4" />
                <span className="text-[10px] uppercase tracking-widest font-mono">Stitched timeline</span>
              </div>
            )}
            <h2 className={`font-semibold text-white truncate ${embedded ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'}`}>{title}</h2>
            <p className="text-[11px] sm:text-xs text-white/40 mt-0.5">
              {loading
                ? 'Loading…'
                : `${items.length} item${items.length !== 1 ? 's' : ''}${embedded ? '' : ' · moments & events woven together'}`}
              {data?.has_user_order && !loading && ' · custom order saved'}
              {!loading && (data?.excluded_count ?? 0) > 0 && (
                <span
                  className="text-white/25"
                  title="Items from the same period that belong to other stories were left out of this scene"
                >
                  {' '}· {data!.excluded_count} unrelated hidden
                </span>
              )}
              {!loading && (data?.merge_log?.length ?? 0) > 0 && (
                <span
                  className="text-white/25"
                  title={data!.merge_log!
                    .map((m) => `${m.canonical_title} ← ${m.merged_titles.join(' · ')}`)
                    .join('\n')}
                >
                  {' '}· {data!.merge_log!.length} duplicate{data!.merge_log!.length !== 1 ? 's' : ''} merged
                </span>
              )}
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-white/10 text-white/50 active:bg-white/10"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      <div className={`flex-1 min-h-0 overflow-y-auto ${hideHeader ? 'px-3 py-3' : embedded ? 'px-3 py-3 sm:px-6 sm:py-4' : 'w-full max-w-5xl mx-auto px-4 py-4 sm:px-6'}`}>
        {displayError && (
          <p className={`text-red-400/80 mb-3 ${isMobile ? 'text-xs px-1' : 'text-sm'}`}>{displayError}</p>
        )}
        {loading ? (
          <div className="py-16 text-center text-white/40 text-sm animate-pulse">Stitching timeline…</div>
        ) : (
          <>
            {data?.chapter && (
              <section className="mb-5 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/12 via-white/[0.03] to-transparent px-4 py-4 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-primary/80">
                      <BookOpen className="h-4 w-4 shrink-0" />
                      <span className="text-[10px] uppercase tracking-widest font-mono">Narrative chapter</span>
                    </div>
                    <p className="mt-2 text-[11px] text-white/35 uppercase tracking-wide">Chapter thesis</p>
                    <p className="mt-1 text-sm sm:text-base leading-relaxed text-white/85">{data.chapter.thesis}</p>
                  </div>
                  {data.chapter.quality.overallStoryQuality != null && (
                    <div className="shrink-0 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-2 text-center">
                      <p className="text-lg font-semibold text-emerald-300 leading-none">
                        {Math.round(data.chapter.quality.overallStoryQuality)}
                      </p>
                      <p className="mt-1 text-[9px] uppercase tracking-wide text-emerald-300/60">story quality</p>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-violet-200/80">
                    <Target className="h-3 w-3" />
                    {data.chapter.dominantTheme}
                  </span>
                  <span className="text-white/35">
                    {data.chapter.supportingEventIds.length} supporting scene{data.chapter.supportingEventIds.length !== 1 ? 's' : ''}
                  </span>
                  {chapterDate && (
                    <span className="text-white/35">{chapterDate}</span>
                  )}
                </div>
              </section>
            )}

            {data?.chapter && (
              <h3 className="mb-2 px-1 text-[11px] uppercase tracking-widest font-mono text-white/40">
                Supporting scenes
              </h3>
            )}
            <TimelineReorderableList
              items={displayedItems}
              selectedId={selected?.id}
              saving={saving}
              onSelect={handleSelect}
              onReorder={reorderItems}
              onSaveOrder={persistOrder}
            />

            {/* Persistent-state facts from the same period — context that
                shapes the scene without being part of it. */}
            {((data?.background?.length ?? 0) > 0 || (data?.chapter?.backgroundContext.length ?? 0) > 0) && (
              <section className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                <h3 className="text-[11px] uppercase tracking-widest font-mono text-white/35 mb-2">
                  Background during this chapter
                </h3>
                <ul className="space-y-1.5">
                  {data?.chapter?.backgroundContext.map((context) => (
                    <li key={context} className="flex items-start gap-2 text-sm text-white/55">
                      <span className="text-white/25 mt-0.5 select-none">•</span>
                      <span className="select-text leading-relaxed">{context}</span>
                    </li>
                  ))}
                  {(data?.background ?? []).map((bg) => (
                    <li key={bg.id} className="flex items-start gap-2 text-sm text-white/55">
                      <span className="text-white/25 mt-0.5 select-none">•</span>
                      {bg.kind === 'moment' ? (
                        <button
                          type="button"
                          onClick={() => handleSelect(bg)}
                          className="text-left select-text hover:text-white/80 transition-colors leading-relaxed"
                        >
                          {bg.title}
                        </button>
                      ) : (
                        <span className="select-text leading-relaxed">{bg.title}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(data?.chapter?.outcomes.length ?? 0) > 0 && (
              <section className="mt-4 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] px-4 py-3">
                <h3 className="text-[11px] uppercase tracking-widest font-mono text-emerald-300/55 mb-2">
                  What changed
                </h3>
                <ul className="space-y-1.5">
                  {data!.chapter!.outcomes.map((outcome) => (
                    <li key={outcome} className="flex items-start gap-2 text-sm text-white/65">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/70 mt-0.5 shrink-0" />
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      {selected && selected.kind === 'event' && (
        isMobile ? (
          <MobileBottomSheet
            open
            onClose={() => setSelected(null)}
            title="Event details"
          >
            <TimelineInlineDate iso={selected.sortTime} size="lg" />
            <p className="text-sm font-medium text-white mt-3">{selected.title}</p>
            {selected.body && (
              <p className="text-sm text-white/60 mt-2 leading-relaxed">{selected.body}</p>
            )}
          </MobileBottomSheet>
        ) : (
          <div className="flex-shrink-0 border-t border-white/10 px-4 sm:px-6 py-3 bg-black/90 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <TimelineInlineDate iso={selected.sortTime} size="lg" />
            <p className="text-sm text-white/70 mt-2">{selected.title}</p>
            {selected.body && (
              <p className="text-xs text-white/50 mt-1 line-clamp-3">{selected.body}</p>
            )}
          </div>
        )
      )}
    </div>
  );

  if (embedded || typeof document === 'undefined') return content;
  return createPortal(content, document.body);
};
