import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { fetchWhatChanged } from '../../../api/whatChanged';
import type { ChatThread } from '../hooks/useChatThreads';
import { analytics } from '../../../lib/monitoring';

const MIN_GAP_HOURS = 20;   // below this, "since last time" reads as noise, not signal
const MAX_GAP_HOURS = 24 * 60; // 60 days — beyond this the diff is too large to feel concrete
const MIN_MSG_COUNT = 3;    // mirrors the trust-floor: don't surface this for empty threads

type Props = {
  thread: ChatThread | null | undefined;
};

/**
 * The primary continuity-proof surface (Sprint H).
 *
 * Fires once, quietly, when a user reopens a thread after a qualifying gap —
 * before they type anything. Shows exactly what LoreBook recorded while they
 * were away: factual, evidence-backed, concise. No interpretation, no warmth
 * performance — just proof that the system kept paying attention.
 *
 * This is the "I remembered. I learned. I know what's changed." moment,
 * made structural instead of left to chance.
 */
export const WhatChangedSinceLastTime = ({ thread }: Props) => {
  const [lines, setLines] = useState<string[] | null>(null);
  const [gapDays, setGapDays] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [seenThreadId, setSeenThreadId] = useState<string | null>(null);

  useEffect(() => {
    if (!thread || thread.id === seenThreadId) return;

    const gapHours = (Date.now() - new Date(thread.updatedAt).getTime()) / 3_600_000;
    if (gapHours < MIN_GAP_HOURS || gapHours > MAX_GAP_HOURS) return;
    if (thread.messages.length < MIN_MSG_COUNT) return;

    setSeenThreadId(thread.id);

    fetchWhatChanged(thread.updatedAt)
      .then(({ summary, lines: serverLines }) => {
        if (!summary.hasChanges) return;
        setLines(serverLines);
        setGapDays(summary.gapDays);
        analytics.track('what_changed_shown', {
          threadId: thread.id,
          gapDays: Math.round(summary.gapDays),
          lineCount: serverLines.length,
        });
      })
      .catch(() => {
        // Silent — this is a delight surface, never an error surface.
      });
  }, [thread, seenThreadId]);

  if (!lines || lines.length === 0 || dismissed) return null;

  const gapLabel = gapDays != null
    ? gapDays < 1.5 ? 'since yesterday'
      : gapDays < 2.5 ? 'since 2 days ago'
      : `over the last ${Math.round(gapDays)} days`
    : 'since your last visit';

  const dismiss = () => {
    setDismissed(true);
    analytics.track('what_changed_dismissed', { threadId: thread?.id });
  };

  return (
    <div className="mx-4 mb-2 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400/80 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-white/70">
              While you were away {gapLabel}
            </p>
            <ul className="mt-1.5 space-y-1">
              {lines.map((line, i) => (
                <li key={i} className="text-xs text-white/55 leading-snug flex items-start gap-1.5">
                  <span className="text-white/25 mt-0.5">·</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-white/25 hover:text-white/50 transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
