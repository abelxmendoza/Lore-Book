import { useEffect, useState } from 'react';
import { BookOpen, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { lifeHistoryApi, type LifeHistoryChapter } from '../../api/lifeHistory';
import { cn } from '../../lib/cn';

const CATEGORY_COLORS: Record<string, string> = {
  career: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
  relationship: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
  education: 'text-violet-300 border-violet-500/30 bg-violet-500/10',
  move: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  achievement: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  failure: 'text-red-300 border-red-500/30 bg-red-500/10',
  health: 'text-teal-300 border-teal-500/30 bg-teal-500/10',
  other: 'text-white/50 border-white/15 bg-white/5',
};

function ChapterCard({
  chapter,
  defaultOpen,
  showAllEvents = false,
}: {
  chapter: LifeHistoryChapter;
  defaultOpen?: boolean;
  showAllEvents?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const badge = CATEGORY_COLORS[chapter.dominantCategory] ?? CATEGORY_COLORS.other;
  const visibleEvents = showAllEvents ? chapter.events : chapter.events.slice(0, 6);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', badge)}>
              {chapter.dominantCategory}
            </span>
            <span className="text-[10px] text-white/35 font-mono">
              {chapter.startDate} → {chapter.endDate}
            </span>
          </div>
          <p className="text-sm font-medium text-white/90">{chapter.title}</p>
          <p className="text-xs text-white/50 mt-1 line-clamp-2">{chapter.summary}</p>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-white/30 mt-1 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-white/8">
          {visibleEvents.map((event) => (
            <div key={event.id} className="flex items-start gap-2 pt-2">
              <span className="text-[10px] text-white/30 w-16 shrink-0">{event.startTime.slice(0, 10)}</span>
              <div className="min-w-0">
                <p className="text-xs text-white/75">{event.title}</p>
                <p className="text-[10px] text-white/35">
                  significance {Math.round(event.significance * 100)}%
                </p>
              </div>
            </div>
          ))}
          {!showAllEvents && chapter.events.length > 6 && (
            <p className="text-[10px] text-white/30 pt-1">+{chapter.events.length - 6} more events</p>
          )}
        </div>
      )}
    </div>
  );
}

type LifeHistoryChaptersPanelProps = {
  compact?: boolean;
  /** Omit or pass null to show every compiled chapter. */
  maxChapters?: number | null;
  showAllEvents?: boolean;
  eventLimit?: number;
};

export function LifeHistoryChaptersPanel({
  compact = false,
  maxChapters = 5,
  showAllEvents = false,
  eventLimit = 2000,
}: LifeHistoryChaptersPanelProps) {
  const [chapters, setChapters] = useState<LifeHistoryChapter[]>([]);
  const [eventCount, setEventCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    lifeHistoryApi
      .getLifeChapters({ limit: eventLimit })
      .then((res) => {
        if (res.success) {
          setChapters(res.chapters);
          setEventCount(res.eventCount);
        }
      })
      .catch(() => setError('Life chapters not available yet.'))
      .finally(() => setLoading(false));
  }, [eventLimit]);

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-white/10 bg-white/[0.03]', compact ? 'p-3' : 'p-4')}>
        <div className="flex items-center gap-2 text-indigo-300/70 text-xs">
          <Loader2 className="h-4 w-4 animate-spin" />
          Compiling life chapters…
        </div>
      </div>
    );
  }

  if (error || chapters.length === 0) {
    return (
      <div className={cn('rounded-xl border border-white/10 bg-white/[0.03]', compact ? 'p-3' : 'p-4')}>
        <div className="flex items-center gap-2 text-white/40 text-xs">
          <AlertCircle className="h-3.5 w-3.5" />
          {error ?? (eventCount === 0 ? 'Add more memories to generate life chapters.' : 'No chapters detected yet.')}
        </div>
      </div>
    );
  }

  const visible =
    maxChapters == null
      ? [...chapters].reverse()
      : chapters.slice(-maxChapters).reverse();

  return (
    <div
      className={cn('rounded-xl border border-indigo-500/20 bg-indigo-950/10', compact ? 'p-3' : 'p-4')}
      data-testid="life-history-chapters-panel"
    >
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="h-4 w-4 text-indigo-400" />
        <span className="text-sm font-semibold text-white/85">Life chapters</span>
        <span className="text-[10px] text-white/35 ml-auto">{chapters.length} eras · {eventCount} events</span>
      </div>
      <div className="space-y-2">
        {visible.map((chapter, i) => (
          <ChapterCard
            key={chapter.id}
            chapter={chapter}
            defaultOpen={i === 0}
            showAllEvents={showAllEvents}
          />
        ))}
      </div>
    </div>
  );
}
