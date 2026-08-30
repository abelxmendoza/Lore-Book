/**
 * Stitched timeline: moments + events in one chronological stream, user-reorderable.
 */

import { BookMarked, BookOpen, CheckCircle2, Layers, MessageCircle, Target, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import type { NarrativeChapter, StitchedTimelineItem } from '../../api/stitchedTimeline';
import { useEntityModal } from '../../contexts/EntityModalContext';
import { useMockData } from '../../contexts/MockDataContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useStitchedTimeline } from '../../hooks/useStitchedTimeline';
import { isBackendConnectionError } from '../../lib/backendErrorDisplay';
import type { LorebookContentMeterModel } from '../../lib/lorebookContentMeter';
import type { LorebookForm } from '../../lib/lorebookTiers';
import type { LoreReadinessSummary } from '../../lib/loreReadiness';
import {
  buildStitchedTimelineFollowUpPrompts,
  meterFromStitchedTimeline,
  openStitchedTimelineChat,
} from '../../lib/stitchedTimelineChat';
import type { TimelineSubjectLorebookOffer } from '../../lib/timelineSubjectLorebook';
import { sortStitchedItemsNewestFirst } from '../../lib/unifiedTimeline';
import { LorebookContentMeter } from '../lorebook/LorebookContentMeter';
import { LorebookTierMenu } from '../lorebook/LorebookTierMenu';
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
  /** Domain readiness for vignette / LoreBook unlock boosts. */
  readiness?: LoreReadinessSummary | null;
  /** Demo mode unlocks LoreBook menus even below thresholds. */
  forceLorebookUnlock?: boolean;
  /** Open KnowledgeBaseCreator from the chapter’s compiler meter. */
  onCreateLorebook?: (args: {
    form?: LorebookForm;
    offer: TimelineSubjectLorebookOffer;
    meter: LorebookContentMeterModel;
  }) => void;
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
  readiness = null,
  forceLorebookUnlock = false,
  onCreateLorebook,
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

  const title =
    scopeLabel ??
    data?.scope_label ??
    (lifeArcId ? 'Life arc timeline' : 'Your full timeline');

  const chatInput = useMemo(
    () => ({
      title,
      lifeArcId,
      items,
      chapter: data?.chapter ?? null,
      scopeType: (lifeArcId ? 'life_arc' : 'global') as 'life_arc' | 'global',
    }),
    [title, lifeArcId, items, data?.chapter],
  );

  const { offer: loreOffer, meter: loreMeter } = useMemo(
    () =>
      meterFromStitchedTimeline({
        title,
        items,
        chapter: data?.chapter ?? null,
        readiness,
      }),
    [title, items, data?.chapter, readiness],
  );

  const canCreateLorebook =
    Boolean(loreMeter.tierOffer?.canCreateAny) || forceLorebookUnlock;
  const followUps = useMemo(
    () => buildStitchedTimelineFollowUpPrompts(chatInput),
    [chatInput],
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

  const continueInChat = (prompt?: string) => {
    const trimmed = prompt?.trim();
    openStitchedTimelineChat({
      ...chatInput,
      ...(trimmed ? { initialPrompt: trimmed, autoSubmit: true } : {}),
    });
    onClose?.();
  };

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

  const lorebookActions = !loading && (
    <div
      className="inline-flex items-center justify-center gap-1.5 min-w-0 w-full"
      data-testid="stitched-timeline-lorebook"
    >
      {onCreateLorebook && loreMeter.tierOffer ? (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/[0.07] pl-2 pr-1.5 py-1">
          <LorebookTierMenu
            tierOffer={loreMeter.tierOffer}
            forceEnable={canCreateLorebook && !loreMeter.tierOffer.canCreateAny}
            onSelectForm={(form) =>
              onCreateLorebook({ form, offer: loreOffer, meter: loreMeter })
            }
            subjectLabel={title}
            testId="stitched-timeline-lorebook-tier-menu"
          />
          <LorebookContentMeter meter={loreMeter} />
        </div>
      ) : (
        <div
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/[0.07] px-2 py-1"
          title={loreOffer.reason}
        >
          <BookMarked className="h-3.5 w-3.5 text-amber-300/80" aria-hidden="true" />
          <span className="text-[11px] text-amber-100/80 font-medium">Compiler</span>
          <LorebookContentMeter meter={loreMeter} />
        </div>
      )}
    </div>
  );

  const chatActions = !loading && (
    <div className="flex flex-col gap-1 min-w-0" data-testid="stitched-timeline-chat">
      <button
        type="button"
        onClick={() => continueInChat()}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-cyan-100/90 hover:bg-cyan-500/18 hover:border-cyan-400/40 touch-manipulation transition-colors"
        data-testid="stitched-timeline-continue-chat"
        title="Open main chat focused on this chapter"
      >
        <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-90" />
        Continue in chat
      </button>
      <div className="flex flex-col gap-0.5">
        {followUps.slice(0, 3).map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => continueInChat(prompt)}
            className="w-full rounded-md px-2 py-1 text-left text-[10px] leading-snug text-white/40 hover:bg-white/[0.04] hover:text-cyan-100/80 touch-manipulation transition-colors"
            data-testid="stitched-timeline-followup"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );

  const headerTools = !loading && (
    <div className="mt-3 w-full max-w-[15.5rem] sm:max-w-[16.5rem] sm:mx-auto">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-col gap-2">
          {lorebookActions}
          <div className="h-px bg-white/8" aria-hidden="true" />
          {chatActions}
        </div>
      </div>
    </div>
  );

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
        <div
          className={`relative flex-shrink-0 border-b border-white/10 ${
            embedded ? 'px-3 py-3 sm:px-6 sm:py-4' : 'px-4 py-4 sm:px-6 sm:pt-5 sm:pb-4'
          }`}
        >
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-white/10 text-white/50 hover:bg-white/10 active:bg-white/10"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          )}

          <div
            className={[
              'min-w-0',
              embedded
                ? 'pr-12'
                : 'text-center flex flex-col items-center mx-auto max-w-xl px-10 sm:px-12',
            ].join(' ')}
          >
            {!embedded && (
              <div className="flex items-center justify-center gap-2 text-primary/80 mb-1">
                <Layers className="h-4 w-4" />
                <span className="text-[10px] uppercase tracking-widest font-mono">Stitched timeline</span>
              </div>
            )}
            <h2
              className={`font-semibold text-white ${
                embedded
                  ? 'text-base sm:text-lg truncate'
                  : 'text-lg sm:text-xl text-balance'
              }`}
            >
              {title}
            </h2>
            <p
              className={`text-[11px] sm:text-xs text-white/40 mt-0.5 ${
                embedded ? '' : 'text-center'
              }`}
            >
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

          {!loading && headerTools}
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
            {hideHeader && <div className="mb-4">{headerTools}</div>}

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
            <TimelineInlineDate
              iso={selected.sortTime}
              size="lg"
              precision={selected.timePrecision}
              confidence={selected.timeConfidence}
            />
            <p className="text-sm font-medium text-white mt-3">{selected.title}</p>
            {selected.body && (
              <p className="text-sm text-white/60 mt-2 leading-relaxed">{selected.body}</p>
            )}
          </MobileBottomSheet>
        ) : (
          <div className="flex-shrink-0 border-t border-white/10 px-4 sm:px-6 py-3 bg-black/90 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <TimelineInlineDate
              iso={selected.sortTime}
              size="lg"
              precision={selected.timePrecision}
              confidence={selected.timeConfidence}
            />
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
