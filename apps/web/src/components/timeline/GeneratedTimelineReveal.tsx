import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  X,
  RefreshCw,
  BookMarked,
  Sparkles,
} from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { ChronologyEntry } from '../../types/timelineV2';
import type { LifeArc } from '../../hooks/useLifeArcs';
import type { MockGeneratedTimelineEvent } from '../../mocks/timelineGenerationMock';
import type {
  CompiledTimelineEvent,
  SubjectTimelineCompilationSummary,
  ResolvedTimelineSubject,
  SubjectTimelineMode,
  SubjectTimelinePhase,
} from '../../api/subjectTimeline';
import type { LorebookContentMeterModel } from '../../lib/lorebookContentMeter';
import type { LorebookForm } from '../../lib/lorebookTiers';
import { buildGeneratedTimelineClipboardText } from '../../lib/generatedTimelineClipboard';
import { copyTextToClipboard } from '../../lib/listClipboard';
import { LorebookContentMeter } from '../lorebook/LorebookContentMeter';
import { LorebookTierMenu } from '../lorebook/LorebookTierMenu';
import { buildRailGradient, getLaneColor } from './generatedTimelineColors';
import {
  spreadTimelineLeftPercentages,
  timelineCardWidthPx,
  timelineTrackMinWidthPx,
  timelineTrackPaddingPx,
} from './timelineLayout';
import './TimelineGeneratingSimulation.css';

export type GeneratedTimelineEvent =
  | ChronologyEntry
  | MockGeneratedTimelineEvent
  | CompiledTimelineEvent;

function isMockEvent(e: GeneratedTimelineEvent): e is MockGeneratedTimelineEvent {
  return 'stateChange' in e || String(e.id).startsWith('mock-gen-');
}

function isCompiledEvent(e: GeneratedTimelineEvent): e is CompiledTimelineEvent {
  return 'subjectRelation' in e && 'whyIncluded' in e;
}

type PositionedEvent = {
  event: GeneratedTimelineEvent;
  leftPct: number;
  color: ReturnType<typeof getLaneColor>;
  index: number;
};

type Props = {
  query: string;
  events: GeneratedTimelineEvent[];
  arcs?: LifeArc[];
  isMock?: boolean;
  collapsed?: boolean;
  fromLibrary?: boolean;
  savedAt?: string;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  onRegenerate?: () => void;
  onEventClick?: (event: GeneratedTimelineEvent) => void;
  onArcClick?: (arc: LifeArc) => void;
  /** Open the LoreBook creator prefilled with this timeline's range/query. */
  onCreateLorebook?: (form?: LorebookForm) => void;
  /** When false, button stays visible but disabled with a readiness reason. */
  canCreateLorebook?: boolean;
  lorebookReason?: string;
  /** Content buildup toward a LoreBook for this subject. */
  lorebookMeter?: LorebookContentMeterModel | null;
  /** Server interpretation, coverage, and provenance for a compiled subject timeline. */
  compilation?: SubjectTimelineCompilationSummary | null;
  /** Low-priority associations that should not displace primary events. */
  contextEvents?: CompiledTimelineEvent[];
  /** Honest failure state when the server compiler could not complete. */
  generationError?: string | null;
  /** Resolve an ambiguous query to the entity the user actually meant. */
  onSelectSubject?: (subject: ResolvedTimelineSubject) => void;
};

function eventTime(e: GeneratedTimelineEvent): number {
  const t = new Date(e.start_time).getTime();
  return Number.isFinite(t) ? t : 0;
}

function formatDate(iso: string): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return 'Undated';
  return t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatYear(iso: string): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return '';
  return String(t.getFullYear());
}

function formatSavedAt(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMode(mode: SubjectTimelineMode): string {
  switch (mode) {
    case 'EMPLOYMENT_TIMELINE': return 'Employment timeline';
    case 'RELATIONSHIP_TIMELINE': return 'Relationship timeline';
    case 'PROJECT_TIMELINE': return 'Project evolution';
    case 'PLACE_TIMELINE': return 'Place timeline';
    case 'DATE_TIMELINE': return 'Date timeline';
    case 'EVIDENCE_SEARCH': return 'Evidence results';
    case 'SUBJECT_TIMELINE': return 'Subject timeline';
  }
}

function formatPhase(phase: SubjectTimelinePhase): string {
  return phase.replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
}

function formatPeriod(start: string, end: string): string {
  const startLabel = formatDate(start);
  const endLabel = formatDate(end);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

type EventCardBodyProps = {
  event: GeneratedTimelineEvent;
  color: ReturnType<typeof getLaneColor>;
  isMobile: boolean;
  compact?: boolean;
  onEventClick?: (event: GeneratedTimelineEvent) => void;
};

function EventCardBody({ event, color, isMobile, compact, onEventClick }: EventCardBodyProps) {
  const laneLimit = compact || isMobile ? 1 : 2;
  const compiled = isCompiledEvent(event) ? event : null;
  const title = 'title' in event ? event.title : undefined;
  const datePrefix =
    compiled?.occurrence_status === 'unresolved' || compiled?.time_precision === 'approximate'
      ? 'Approx. '
      : '';

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 mb-1">
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${color.text}`}>
          {datePrefix}{formatDate(event.start_time)}
        </span>
        {event.timeline_names?.slice(0, laneLimit).map((name) => (
          <span
            key={name}
            className={`text-[9px] px-1.5 py-0.5 rounded-full ${getLaneColor(name).badgeBg}`}
          >
            {name}
          </span>
        ))}
      </div>
      {isMockEvent(event) && event.stateChange && (
        <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-md mb-1 ${color.badgeBg}`}>
          {event.stateChange}
        </span>
      )}
      {compiled && (
        <div className="flex flex-wrap items-center gap-1 mb-1.5">
          <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-md ${color.badgeBg}`}>
            {formatPhase(compiled.phase)}
          </span>
          <span className="text-[9px] text-white/45">
            {Math.round(compiled.relevance * 100)}% relevant
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={() => onEventClick?.(event)}
        className="text-left w-full touch-manipulation"
      >
        {title && title.trim() && (
          <p className={`font-medium text-white mb-1 line-clamp-2 ${isMobile || compact ? 'text-xs' : 'text-sm'}`}>
            {title}
          </p>
        )}
        <p
          className={`text-white/90 line-clamp-4 hover:text-white leading-snug ${isMobile || compact ? 'text-[11px]' : 'text-sm'}`}
        >
          {event.content}
        </p>
      </button>
      {compiled && (
        <details className="mt-2 border-t border-white/8 pt-1.5 text-[10px] text-white/50">
          <summary className="cursor-pointer select-none text-white/55 hover:text-white/75">
            Why this belongs · {compiled.evidenceCount} source{compiled.evidenceCount !== 1 ? 's' : ''}
          </summary>
          <p className="mt-1 leading-relaxed">{compiled.whyIncluded}</p>
          <p className="mt-1 text-white/35">
            {compiled.source_type.replace(/_/g, ' ')} · {Math.round(compiled.time_confidence * 100)}% date confidence
          </p>
        </details>
      )}
    </>
  );
}

export function GeneratedTimelineReveal({
  query,
  events,
  arcs = [],
  isMock = false,
  collapsed = false,
  fromLibrary = false,
  savedAt,
  onToggleCollapse,
  onClose,
  onRegenerate,
  onEventClick,
  onArcClick,
  onCreateLorebook,
  canCreateLorebook = true,
  lorebookReason,
  lorebookMeter,
  compilation,
  contextEvents = [],
  generationError,
  onSelectSubject,
}: Props) {
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const sorted = useMemo(
    () => [...events].sort((a, b) => eventTime(a) - eventTime(b)),
    [events],
  );

  const clipboardText = useMemo(
    () =>
      buildGeneratedTimelineClipboardText(
        query,
        sorted.map((event) => ({
          id: event.id,
          start_time: event.start_time,
          content: event.content,
          title: 'title' in event ? event.title : undefined,
          timeline_names: event.timeline_names,
          tags: 'tags' in event ? event.tags : undefined,
          stateChange: isMockEvent(event) ? event.stateChange : undefined,
          significance:
            isMockEvent(event) || isCompiledEvent(event) ? event.significance : undefined,
        })),
        { isMock, fromLibrary },
      ),
    [query, sorted, isMock, fromLibrary],
  );

  const handleCopyAll = async () => {
    const ok = await copyTextToClipboard(clipboardText);
    if (!ok) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const cardWidth = timelineCardWidthPx(isMobile);
  const trackPaddingPx = timelineTrackPaddingPx(isMobile);
  const trackMinWidth = timelineTrackMinWidthPx(sorted.length, isMobile);

  const positioned = useMemo((): PositionedEvent[] => {
    if (sorted.length === 0) return [];

    const times = sorted.map(eventTime);
    const min = Math.min(...times);
    const max = Math.max(...times);
    const span = max - min || 1;
    const pad = sorted.length === 1 ? 50 : 8;

    const timeBased = sorted.map((event, index) => {
      const raw = ((eventTime(event) - min) / span) * (100 - pad * 2) + pad;
      return {
        event,
        leftPct: Math.max(pad, Math.min(100 - pad, raw)),
        color: getLaneColor(event.timeline_names?.[0]),
        index,
      };
    });

    if (isMobile) return timeBased;

    const spread = spreadTimelineLeftPercentages(
      timeBased.map((p) => p.leftPct),
      {
        trackWidthPx: trackMinWidth,
        cardWidthPx: cardWidth,
        edgePadPct: pad,
        trackPaddingPx: trackPaddingPx,
      },
    );

    return timeBased.map((p, i) => ({ ...p, leftPct: spread[i] }));
  }, [sorted, isMobile, trackMinWidth, cardWidth, trackPaddingPx]);

  const railGradient = useMemo(
    () => buildRailGradient(positioned.map((p) => p.color.rail)),
    [positioned],
  );

  const yearMarkers = useMemo(() => {
    const seen = new Set<string>();
    return positioned.filter((p) => {
      const y = formatYear(p.event.start_time);
      if (!y || seen.has(y)) return false;
      seen.add(y);
      return true;
    });
  }, [positioned]);

  const savedLabel = formatSavedAt(savedAt);

  return (
    <div
      className="flex-1 min-h-0 flex flex-col timeline-gen-reveal"
      data-testid="generated-timeline-reveal"
    >
      <header className="timeline-gen-reveal-header shrink-0 sticky top-0 z-10 border-b border-white/8 bg-black/90 backdrop-blur-md px-3 sm:px-6 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between max-w-full">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              <h2 className="text-base sm:text-lg font-semibold text-white break-words">{query}</h2>
              <span className="text-[10px] sm:text-xs text-white/40 shrink-0">
                {events.length} moment{events.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {fromLibrary && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25">
                  <BookMarked className="h-3 w-3" />
                  In library{savedLabel ? ` · ${savedLabel}` : ''}
                </span>
              )}
              {isMock && (
                <span className="text-[10px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                  Simulated preview
                </span>
              )}
              {compilation && !isMock && (
                <>
                  <span
                    className="text-[10px] text-cyan-200/90 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-2 py-0.5"
                    data-testid="timeline-interpretation"
                  >
                    {formatMode(compilation.intent.mode)}
                  </span>
                  <span className="text-[10px] text-white/60 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
                    {compilation.subject
                      ? `Focused on ${compilation.subject.displayName}`
                      : `Topic: ${compilation.intent.subjectQuery}`}
                  </span>
                  <span
                    className={`text-[10px] rounded-full border px-2 py-0.5 ${
                      compilation.coverage.score >= 0.8
                        ? 'text-emerald-200 bg-emerald-500/10 border-emerald-500/20'
                        : 'text-amber-200 bg-amber-500/10 border-amber-500/20'
                    }`}
                    data-testid="timeline-coverage"
                  >
                    {Math.round(compilation.coverage.score * 100)}% story coverage
                  </span>
                  {compilation.period && (
                    <span className="text-[10px] text-white/45">
                      {formatPeriod(compilation.period.start, compilation.period.end)}
                    </span>
                  )}
                </>
              )}
              {onCreateLorebook && lorebookReason && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    canCreateLorebook
                      ? 'text-amber-200/90 bg-amber-500/10 border-amber-500/25'
                      : 'text-white/45 bg-white/5 border-white/10'
                  }`}
                  data-testid="timeline-lorebook-readiness"
                >
                  {lorebookReason}
                </span>
              )}
            </div>
            {compilation?.warnings.map((warning) => (
              <p key={warning} className="mt-1.5 text-[11px] text-amber-200/70">
                {warning}
              </p>
            ))}
            {generationError && (
              <p
                className="mt-1.5 text-[11px] text-red-200/80"
                data-testid="timeline-generation-error"
              >
                Timeline compilation failed: {generationError}
              </p>
            )}
            {compilation?.ambiguity.length ? (
              <div
                className="mt-2 flex flex-wrap items-center gap-1.5"
                data-testid="timeline-subject-ambiguity"
              >
                <span className="text-[11px] text-white/50">Which subject did you mean?</span>
                {compilation.ambiguity.map((candidate) => (
                  <button
                    key={`${candidate.entityType}:${candidate.entityId}`}
                    type="button"
                    onClick={() => onSelectSubject?.(candidate)}
                    className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100 hover:bg-cyan-500/20"
                  >
                    {candidate.displayName}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start">
            {events.length > 0 && (
              <button
                type="button"
                onClick={() => void handleCopyAll()}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-white/10 text-white/60 text-xs hover:bg-white/5 touch-manipulation"
                title="Copy the whole timeline as plain text"
                aria-label="Copy all timeline moments"
                data-testid="generated-timeline-copy-all"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy all'}</span>
              </button>
            )}
            {onCreateLorebook && (
              <div
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 pl-2.5 pr-1.5 py-1.5"
                data-testid="timeline-create-lorebook"
              >
                {lorebookMeter?.tierOffer ? (
                  <LorebookTierMenu
                    tierOffer={lorebookMeter.tierOffer}
                    forceEnable={canCreateLorebook && !lorebookMeter.tierOffer.canCreateAny}
                    onSelectForm={(form) => onCreateLorebook(form)}
                    subjectLabel={query}
                    testId="timeline-lorebook-tier-menu"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onCreateLorebook()}
                    disabled={!canCreateLorebook}
                    className="inline-flex items-center gap-1 text-amber-300/90 text-xs hover:text-amber-200 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      lorebookMeter?.detailLabel ||
                      lorebookReason ||
                      (canCreateLorebook
                        ? 'Generate a LoreBook from this timeline subject'
                        : 'Not enough content about this subject yet')
                    }
                  >
                    <span>LoreBook</span>
                  </button>
                )}
                {lorebookMeter && <LorebookContentMeter meter={lorebookMeter} />}
              </div>
            )}
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-white/10 text-white/60 text-xs hover:bg-white/5 touch-manipulation"
                title="Regenerate timeline"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Regenerate</span>
              </button>
            )}
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                data-testid="timeline-collapse-toggle"
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-white/10 text-white/60 text-xs hover:bg-white/5 touch-manipulation"
                aria-expanded={!collapsed}
                aria-label={collapsed ? 'Expand timeline' : 'Collapse timeline'}
              >
                {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                <span>{collapsed ? 'Expand' : 'Collapse'}</span>
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-white/10 text-white/60 hover:bg-white/5 hover:text-white touch-manipulation"
                aria-label="Close generated timeline"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {!collapsed && arcs.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide mt-3 pb-0.5 -mx-1 px-1">
            {arcs.slice(0, 6).map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onArcClick?.(a)}
                className="timeline-gen-event shrink-0 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-xs text-primary hover:bg-primary/20 touch-manipulation"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                {a.title}
              </button>
            ))}
          </div>
        )}
      </header>

      {collapsed ? (
        <div className="flex-1 flex items-center justify-center px-4 py-8 text-center">
          <p className="text-sm text-white/40">
            Timeline collapsed — tap Expand to view {events.length} moment{events.length !== 1 ? 's' : ''}.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-6 py-4 sm:py-5">
          <div className="max-w-full mx-auto">
            {events.length === 0 ? (
              <p className="text-sm text-white/40 py-10 text-center px-4">
                No moments match &ldquo;{query}&rdquo;. Try a person, place, era, or theme.
              </p>
            ) : isMobile ? (
              <ol className="timeline-gen-v-list" data-testid="generated-timeline-vertical">
                {positioned.map(({ event, color, index }) => {
                  const high =
                    (isMockEvent(event) || isCompiledEvent(event))
                    && event.significance === 'high';
                  const isLast = index === positioned.length - 1;
                  return (
                    <li
                      key={event.id}
                      className="timeline-gen-v-item timeline-gen-event"
                      style={{ animationDelay: `${0.08 + index * 0.06}s` }}
                    >
                      <div className="timeline-gen-v-rail" aria-hidden="true">
                        <span
                          className={`timeline-gen-v-dot ${color.dot}`}
                          style={{ boxShadow: `0 0 10px ${color.rail}88` }}
                        />
                        {!isLast && (
                          <span
                            className="timeline-gen-v-line"
                            style={{ ['--lane-rail' as string]: color.rail }}
                          />
                        )}
                      </div>
                      <article
                        className={[
                          'timeline-gen-v-card',
                          color.cardBg,
                          color.cardBorder,
                          high ? 'timeline-gen-v-card--high' : '',
                        ].join(' ')}
                        style={{ ['--lane-rail' as string]: color.rail }}
                      >
                        <EventCardBody
                          event={event}
                          color={color}
                          isMobile
                          compact
                          onEventClick={onEventClick}
                        />
                      </article>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="timeline-gen-h-scroll">
                <div className="timeline-gen-h-track" style={{ minWidth: trackMinWidth }}>
                  <div className="timeline-gen-h-years" aria-hidden="true">
                    {yearMarkers.map(({ event, leftPct }) => (
                      <span
                        key={`year-${event.id}`}
                        className="timeline-gen-h-year"
                        style={{ left: `${leftPct}%` }}
                      >
                        {formatYear(event.start_time)}
                      </span>
                    ))}
                  </div>

                  <div className="timeline-gen-h-rail-wrap">
                    <div className="timeline-gen-h-rail" style={{ background: railGradient }} />
                    {positioned.map(({ event, leftPct, color, index }) => (
                      <div
                        key={`dot-${event.id}`}
                        className="timeline-gen-h-node timeline-gen-event"
                        style={{ left: `${leftPct}%`, animationDelay: `${0.06 + index * 0.08}s` }}
                      >
                        <span
                          className={`timeline-gen-h-dot ${color.dot}`}
                          style={{ boxShadow: `0 0 14px ${color.rail}88` }}
                        />
                        <span
                          className="timeline-gen-h-stem"
                          style={{ background: `linear-gradient(180deg, ${color.rail}, transparent)` }}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="timeline-gen-h-cards">
                    {positioned.map(({ event, leftPct, color, index }) => {
                      const above = index % 2 === 0;
                      const high =
                        (isMockEvent(event) || isCompiledEvent(event))
                        && event.significance === 'high';
                      return (
                        <article
                          key={event.id}
                          className={[
                            'timeline-gen-h-card',
                            'timeline-gen-event',
                            above ? 'timeline-gen-h-card--above' : 'timeline-gen-h-card--below',
                            color.cardBg,
                            color.cardBorder,
                            high ? 'timeline-gen-h-card--high' : '',
                          ].join(' ')}
                          style={{
                            left: `${leftPct}%`,
                            width: cardWidth,
                            maxWidth: cardWidth,
                            animationDelay: `${0.1 + index * 0.08}s`,
                            ['--lane-rail' as string]: color.rail,
                          }}
                        >
                          <EventCardBody
                            event={event}
                            color={color}
                            isMobile={false}
                            onEventClick={onEventClick}
                          />
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {contextEvents.length > 0 && (
              <section
                className="mt-6 rounded-xl border border-white/8 bg-white/[0.025] p-3 sm:p-4"
                data-testid="timeline-related-context"
              >
                <h3 className="text-sm font-medium text-white/80">Related context</h3>
                <p className="mt-0.5 text-[11px] text-white/40">
                  Weaker or incidental connections kept out of the main timeline.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {contextEvents.map((event) => {
                    const color = getLaneColor(event.timeline_names?.[0]);
                    return (
                      <article
                        key={`context-${event.id}`}
                        className={`rounded-lg border p-3 ${color.cardBg} ${color.cardBorder}`}
                      >
                        <EventCardBody
                          event={event}
                          color={color}
                          isMobile={isMobile}
                          compact
                          onEventClick={onEventClick}
                        />
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
