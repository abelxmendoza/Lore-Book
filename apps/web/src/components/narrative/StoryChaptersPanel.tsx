import { useEffect, useState } from 'react';
import { BookMarked, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { storyChaptersApi, type StoryChapter } from '../../api/storyChapters';
import { cn } from '../../lib/cn';

function formatRange(start: string | null, end: string | null): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (!start && !end) return 'Undated';
  if (start && end && start.slice(0, 10) !== end.slice(0, 10)) {
    return `${fmt(start)} → ${fmt(end)}`;
  }
  return fmt(start ?? end!);
}

function StoryChapterCard({
  chapter,
  selected,
  defaultOpen,
  onSelect,
}: {
  chapter: StoryChapter;
  selected?: boolean;
  defaultOpen?: boolean;
  onSelect?: (chapter: StoryChapter) => void;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden transition-colors',
        selected
          ? 'border-amber-400/40 bg-amber-500/10'
          : 'border-white/10 bg-white/[0.03]',
      )}
      data-testid={`story-chapter-${chapter.id}`}
    >
      <button
        type="button"
        onClick={() => {
          onSelect?.(chapter);
          setOpen((v) => !v);
        }}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-500/10 text-amber-200/90 font-medium">
              Scene chapter
            </span>
            <span className="text-[10px] text-white/35 font-mono">
              {formatRange(chapter.time_start, chapter.time_end)}
            </span>
          </div>
          <p className="text-sm font-medium text-white/90">{chapter.title}</p>
          <p className="text-xs text-white/50 mt-1 line-clamp-2">
            {chapter.thesis || chapter.summary}
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-white/35">
            <span>{chapter.scene_ids.length} scene{chapter.scene_ids.length !== 1 ? 's' : ''}</span>
            {chapter.event_ids.length > 0 && (
              <span>· {chapter.event_ids.length} event{chapter.event_ids.length !== 1 ? 's' : ''}</span>
            )}
            {chapter.significance_score > 0 && (
              <span>· sig {chapter.significance_score}</span>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 text-white/30 mt-1 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/8">
          {chapter.summary && (
            <p className="text-xs text-white/60 pt-2 leading-relaxed">{chapter.summary}</p>
          )}
          {chapter.themes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {chapter.themes.map((theme) => (
                <span
                  key={theme}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-white/45"
                >
                  {theme}
                </span>
              ))}
            </div>
          )}
          {chapter.participants.length > 0 && (
            <p className="text-[10px] text-white/35">
              With {chapter.participants.map((p) => p.replace(/\b\w/g, (c) => c.toUpperCase())).join(', ')}
            </p>
          )}
          {chapter.location && (
            <p className="text-[10px] text-white/35">@ {chapter.location}</p>
          )}
        </div>
      )}
    </div>
  );
}

type StoryChaptersPanelProps = {
  compact?: boolean;
  selectedId?: string | null;
  onSelectChapter?: (chapter: StoryChapter) => void;
};

export function StoryChaptersPanel({
  compact = false,
  selectedId = null,
  onSelectChapter,
}: StoryChaptersPanelProps) {
  const [chapters, setChapters] = useState<StoryChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storyChaptersApi
      .list({ limit: 100 })
      .then((res) => {
        if (res.success) setChapters(res.chapters);
      })
      .catch(() => setError('Story chapters not available yet.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-white/10 bg-white/[0.03]', compact ? 'p-3' : 'p-4')}>
        <div className="flex items-center gap-2 text-amber-300/70 text-xs">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading story chapters…
        </div>
      </div>
    );
  }

  if (error || chapters.length === 0) {
    return (
      <div className={cn('rounded-xl border border-white/10 bg-white/[0.03]', compact ? 'p-3' : 'p-4')}>
        <div className="flex items-center gap-2 text-white/40 text-xs">
          <AlertCircle className="h-3.5 w-3.5" />
          {error ?? 'Chapters appear as Scenes cluster into life periods.'}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-amber-500/20 bg-amber-950/10',
        compact ? 'p-3' : 'p-4',
      )}
      data-testid="story-chapters-panel"
    >
      <div className="flex items-center gap-2 mb-3">
        <BookMarked className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-semibold text-white/85">Story chapters</span>
        <span className="text-[10px] text-white/35 ml-auto">
          {chapters.length} from scenes
        </span>
      </div>
      <div className="space-y-2">
        {[...chapters].reverse().map((chapter, i) => (
          <StoryChapterCard
            key={chapter.id}
            chapter={chapter}
            selected={chapter.id === selectedId}
            defaultOpen={i === 0}
            onSelect={onSelectChapter}
          />
        ))}
      </div>
    </div>
  );
}

export function StoryChapterReader({
  chapter,
  onBack,
}: {
  chapter: StoryChapter;
  onBack?: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto" data-testid="story-chapter-reader">
      <div className="sticky top-0 z-10 border-b border-white/8 bg-black/90 backdrop-blur-sm px-4 py-3 flex items-start gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="md:hidden text-white/50 text-sm mt-1"
          >
            Back
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-amber-300/70 uppercase tracking-widest font-mono mb-1">
            Story chapter
          </p>
          <h2 className="text-lg font-semibold text-white/95">{chapter.title}</h2>
          <p className="text-xs text-white/40 mt-1 font-mono">
            {formatRange(chapter.time_start, chapter.time_end)}
          </p>
        </div>
      </div>
      <div className="px-4 sm:px-8 py-6 max-w-2xl space-y-5">
        {chapter.thesis && (
          <p className="text-base text-white/80 leading-relaxed italic">{chapter.thesis}</p>
        )}
        <p className="text-sm text-white/65 leading-relaxed">{chapter.summary}</p>
        <div className="flex flex-wrap gap-3 text-xs text-white/40">
          <span>{chapter.scene_ids.length} scenes</span>
          <span>{chapter.event_ids.length} events</span>
          <span>significance {chapter.significance_score}</span>
          {chapter.location && <span>@ {chapter.location}</span>}
        </div>
        {chapter.themes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chapter.themes.map((theme) => (
              <span
                key={theme}
                className="text-[11px] px-2 py-0.5 rounded-md border border-white/10 bg-white/5 text-white/50"
              >
                {theme}
              </span>
            ))}
          </div>
        )}
        {chapter.participants.length > 0 && (
          <p className="text-sm text-white/50">
            With{' '}
            {chapter.participants
              .map((p) => p.replace(/\b\w/g, (c) => c.toUpperCase()))
              .join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}
