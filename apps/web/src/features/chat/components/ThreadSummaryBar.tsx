import { useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Sparkles } from 'lucide-react';
import { useThreadSummary } from '../hooks/useThreadSummary';

type ThreadSummaryBarProps = {
  threadId: string | null;
  messageCount: number;
  isMobile?: boolean;
  onRecallInChat?: (prompt: string) => void;
};

export function ThreadSummaryBar({
  threadId,
  messageCount,
  isMobile = false,
  onRecallInChat,
}: ThreadSummaryBarProps) {
  const { data, loading, refreshing, error, refresh } = useThreadSummary(threadId, messageCount);
  const [expanded, setExpanded] = useState(!isMobile);

  if (!threadId || messageCount === 0) return null;

  const summaryLine =
    data?.summary.short ||
    data?.summary.medium ||
    (loading ? 'Summarizing this thread…' : null);

  if (!summaryLine && !error) return null;

  const recallText = data?.recallText?.trim();

  return (
    <div
      data-testid="thread-summary-bar"
      className="flex-shrink-0 border-b border-white/10 bg-black/30 px-3 sm:px-4 py-2"
    >
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-primary/80 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <button
            type="button"
            className="w-full text-left"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <p className="text-xs sm:text-sm text-white/75 leading-relaxed line-clamp-2 sm:line-clamp-none">
              {error ? 'Summary unavailable — your messages are still saved.' : summaryLine}
            </p>
          </button>
          {expanded && data?.summary.medium && data.summary.medium !== data.summary.short && (
            <p className="mt-1.5 text-xs text-white/55 leading-relaxed">{data.summary.medium}</p>
          )}
          {expanded && data?.continuity && (
            <pre className="mt-2 text-[11px] text-white/45 whitespace-pre-wrap font-sans leading-relaxed">
              {data.continuity}
            </pre>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onRecallInChat && recallText && (
            <button
              type="button"
              data-testid="thread-recall-button"
              onClick={() => onRecallInChat('Recap everything we discussed in this thread.')}
              className="text-[11px] px-2 py-1 rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition-colors touch-manipulation"
            >
              Recall
            </button>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="h-8 w-8 flex items-center justify-center rounded-md text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors touch-manipulation"
            aria-label="Refresh thread summary"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="h-8 w-8 flex items-center justify-center rounded-md text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors touch-manipulation sm:hidden"
            aria-label={expanded ? 'Collapse summary' : 'Expand summary'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
