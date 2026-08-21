import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Sparkles } from 'lucide-react';
import { useThreadSummary } from '../hooks/useThreadSummary';
import type { ThreadSummaryPayload } from '../../../api/threadSummary';
import { SystemNotice } from './SystemNotice';
import {
  scrubPeopleLabels,
  scrubPlacesLabels,
  scrubSummaryDisplayLine,
} from '../utils/threadSurfaceScrub';

type ThreadSummaryBarProps = {
  threadId: string | null;
  messageCount: number;
  isMobile?: boolean;
  onRecallInChat?: (prompt: string) => void;
  /** Durable entity chips are a deterministic floor when summary extraction lagged. */
  confirmedEntities?: Array<{ name: string; type: string }>;
};

function normalizeSummary(value?: string | null) {
  return value
    ?.replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim() || null;
}

export function getDisplaySummary(
  summary?: ThreadSummaryPayload | null,
  loading = false,
  opts: { full?: boolean } = {},
) {
  if (!summary) return loading ? 'Summarizing this thread...' : null;
  const people = scrubPeopleLabels(summary.people ?? []);
  const places = scrubPlacesLabels(summary.places ?? []);
  const short = scrubSummaryDisplayLine(normalizeSummary(summary.short), people, places);
  const medium = scrubSummaryDisplayLine(normalizeSummary(summary.medium), people, places);
  const long = scrubSummaryDisplayLine(normalizeSummary(summary.long), people, places);

  if (opts.full) {
    const full = long || medium || short;
    return full || (loading ? 'Summarizing this thread...' : null);
  }

  if (medium && short) {
    const normalizedShort = short.toLowerCase();
    const normalizedMedium = medium.toLowerCase();
    if (normalizedMedium === normalizedShort || normalizedMedium.startsWith(normalizedShort)) {
      return medium;
    }
  }

  return medium || short || long || (loading ? 'Summarizing this thread...' : null);
}

function SummaryChipGroup({ label, items }: { label: string; items: string[] }) {
  const visibleItems = items.map((item) => item.trim()).filter(Boolean).slice(0, 4);
  if (visibleItems.length === 0) return null;
  return (
    <div className="min-w-0">
      <span className="block text-[10px] uppercase tracking-wide text-white/35 mb-1">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {visibleItems.map((item) => (
          <span
            key={`${label}-${item}`}
            className="max-w-full truncate rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/65"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ThreadSummaryBar({
  threadId,
  messageCount,
  isMobile = false,
  onRecallInChat,
  confirmedEntities = [],
}: ThreadSummaryBarProps) {
  const { data, loading, refreshing, error, refresh } = useThreadSummary(threadId, messageCount);
  const [expanded, setExpanded] = useState(!isMobile);
  const [summaryErrorDismissed, setSummaryErrorDismissed] = useState(false);
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;

  useEffect(() => {
    setExpanded(!isMobileRef.current);
    setSummaryErrorDismissed(false);
  }, [threadId]);

  if (!threadId || messageCount === 0) return null;

  const summaryLine = getDisplaySummary(data?.summary, loading, { full: expanded });
  const showSummaryError = Boolean(error) && !summaryErrorDismissed;

  if (!summaryLine && !showSummaryError) return null;

  if (showSummaryError && !summaryLine) {
    return (
      <div data-testid="thread-summary-bar" className="flex-shrink-0 border-b border-white/10 px-3 py-2 sm:px-4">
        <SystemNotice
          severity="info"
          title="Summary unavailable"
          message="Your messages are unaffected."
          actions={[{
            label: refreshing ? 'Retrying' : 'Retry',
            onClick: () => void refresh(),
            testId: 'thread-summary-retry',
            loading: refreshing,
            disabled: refreshing,
          }]}
          onDismiss={() => setSummaryErrorDismissed(true)}
          testId="thread-summary-error-notice"
        />
      </div>
    );
  }

  const recallText = data?.recallText?.trim();
  const fallbackPeople = confirmedEntities
    .filter((entity) => entity.type === 'character')
    .map((entity) => entity.name);
  const fallbackPlaces = confirmedEntities
    .filter((entity) => entity.type === 'location')
    .map((entity) => entity.name);
  const people = scrubPeopleLabels([...(data?.summary.people ?? []), ...fallbackPeople]);
  const places = scrubPlacesLabels([...(data?.summary.places ?? []), ...fallbackPlaces]);
  const themes = (data?.summary.themes ?? []).map((t) => t.trim()).filter(Boolean);
  const hasContext = people.length > 0 || places.length > 0 || themes.length > 0;

  return (
    <div
      data-testid="thread-summary-bar"
      data-expanded={expanded}
      className="flex-shrink-0 border-b border-white/10 bg-black/35 px-3 py-1.5 sm:px-4 sm:py-2.5"
    >
      {!expanded ? (
        <button
          type="button"
          className="flex min-h-8 w-full items-center gap-2 text-left touch-manipulation"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          data-testid="thread-summary-expand"
        >
          <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-primary/80" />
          <span className="min-w-0 flex-1 truncate text-xs text-white/70 sm:text-sm">
            {summaryLine}
          </span>
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-white/40" aria-hidden />
        </button>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary/80" />
              <p
                data-testid="thread-summary-full-text"
                className="min-w-0 flex-1 max-h-[40vh] overflow-y-auto text-xs leading-relaxed text-white/78 sm:text-sm"
              >
                {summaryLine}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center justify-end gap-1">
              {onRecallInChat && recallText && (
                <button
                  type="button"
                  data-testid="thread-recall-button"
                  onClick={() => onRecallInChat('Recap everything we discussed in this thread.')}
                  className="min-h-8 rounded-md bg-primary/15 px-2.5 py-1 text-[11px] text-primary transition-colors touch-manipulation hover:bg-primary/25"
                >
                  Recall
                </button>
              )}
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                className="flex h-8 w-8 items-center justify-center rounded-md text-white/40 transition-colors touch-manipulation hover:bg-white/10 hover:text-white/70 disabled:opacity-50"
                aria-label="Refresh thread summary"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                data-testid="thread-summary-collapse"
                onClick={() => setExpanded(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-white/40 transition-colors touch-manipulation hover:bg-white/10 hover:text-white/70"
                aria-label="Collapse thread summary"
                aria-expanded
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
          </div>
          {hasContext && (
            <div className="mt-2 grid gap-2 pl-6 sm:grid-cols-3">
              <SummaryChipGroup label="People" items={people} />
              <SummaryChipGroup label="Places" items={places} />
              <SummaryChipGroup label="Themes" items={themes} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
