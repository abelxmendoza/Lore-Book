import { useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Sparkles } from 'lucide-react';
import { useThreadSummary } from '../hooks/useThreadSummary';
import type { ThreadSummaryPayload } from '../../../api/threadSummary';

type ThreadSummaryBarProps = {
  threadId: string | null;
  messageCount: number;
  isMobile?: boolean;
  onRecallInChat?: (prompt: string) => void;
};

function normalizeSummary(value?: string | null) {
  return value
    ?.replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim() || null;
}

export function getDisplaySummary(summary?: ThreadSummaryPayload | null, loading = false) {
  if (!summary) return loading ? 'Summarizing this thread...' : null;
  const short = normalizeSummary(summary.short);
  const medium = normalizeSummary(summary.medium);
  const long = normalizeSummary(summary.long);

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
}: ThreadSummaryBarProps) {
  const { data, loading, refreshing, error, refresh } = useThreadSummary(threadId, messageCount);
  const [expanded, setExpanded] = useState(!isMobile);

  if (!threadId || messageCount === 0) return null;

  const summaryLine = getDisplaySummary(data?.summary, loading);

  if (!summaryLine && !error) return null;

  const recallText = data?.recallText?.trim();
  const hasContext =
    (data?.summary.people?.length ?? 0) > 0 ||
    (data?.summary.places?.length ?? 0) > 0 ||
    (data?.summary.themes?.length ?? 0) > 0;
  const canExpand = Boolean(hasContext);

  return (
    <div
      data-testid="thread-summary-bar"
      className="flex-shrink-0 border-b border-white/10 bg-black/35 px-3 py-2.5 sm:px-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary/80" />
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => setExpanded((v) => !v)}
            disabled={!canExpand}
            aria-expanded={expanded}
          >
            <p className="line-clamp-3 text-xs leading-relaxed text-white/78 sm:line-clamp-2 sm:text-sm">
              {error ? 'Summary unavailable — your messages are still saved.' : summaryLine}
            </p>
          </button>
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
          {canExpand && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-white/40 transition-colors touch-manipulation hover:bg-white/10 hover:text-white/70"
              aria-label={expanded ? 'Collapse summary context' : 'Expand summary context'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
      {expanded && hasContext && (
        <div className="mt-2 grid gap-2 pl-6 sm:grid-cols-3">
          <SummaryChipGroup label="People" items={data?.summary.people ?? []} />
          <SummaryChipGroup label="Places" items={data?.summary.places ?? []} />
          <SummaryChipGroup label="Themes" items={data?.summary.themes ?? []} />
        </div>
      )}
    </div>
  );
}
