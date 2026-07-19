import { useCallback, useEffect, useState } from 'react';
import { BookMarked, Loader2, AlertCircle, ChevronDown, RefreshCw } from 'lucide-react';
import {
  getChapterContributions,
  getChapterOwnership,
  storyChaptersApi,
  type StoryChapter,
} from '../../api/storyChapters';
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

function domainLabel(domain: string | undefined): string {
  if (!domain || domain === 'unknown') return 'Story';
  return domain.replace(/_/g, ' ');
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
  const ownership = getChapterOwnership(chapter);
  const contributions = getChapterContributions(chapter);
  const supporting = contributions.filter((c) => c.classification === 'supporting').length;
  const narrative = ownership?.primaryNarrative || chapter.thesis || chapter.summary;

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
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-500/10 text-amber-200/90 font-medium capitalize">
              {domainLabel(ownership?.domain)}
            </span>
            <span className="text-[10px] text-white/35 font-mono">
              {formatRange(chapter.time_start, chapter.time_end)}
            </span>
          </div>
          <p className="text-sm font-medium text-white/90">{chapter.title}</p>
          <p className="text-xs text-white/55 mt-1 line-clamp-2 italic">
            {narrative}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-white/35">
            {ownership?.primarySubject && (
              <span className="text-amber-200/60">re: {ownership.primarySubject}</span>
            )}
            <span>
              {chapter.scene_ids.length} scene{chapter.scene_ids.length !== 1 ? 's' : ''}
              {supporting > 0 ? ` · ${supporting} supporting` : ''}
            </span>
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
          {(ownership?.primaryConflict || ownership?.primaryOutcome) && (
            <div className="pt-2 space-y-1">
              {ownership.primaryConflict && (
                <p className="text-[11px] text-white/55">
                  <span className="text-white/35">Conflict · </span>
                  {ownership.primaryConflict}
                </p>
              )}
              {ownership.primaryOutcome && (
                <p className="text-[11px] text-white/55">
                  <span className="text-white/35">Outcome · </span>
                  {ownership.primaryOutcome}
                </p>
              )}
            </div>
          )}
          {chapter.summary && chapter.summary !== narrative && (
            <p className="text-xs text-white/55 pt-1 leading-relaxed">{chapter.summary}</p>
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
        </div>
      )}
    </div>
  );
}

type StoryChaptersPanelProps = {
  compact?: boolean;
  selectedId?: string | null;
  onSelectChapter?: (chapter: StoryChapter) => void;
  onReprocessed?: (chapters: StoryChapter[]) => void;
};

export function StoryChaptersPanel({
  compact = false,
  selectedId = null,
  onSelectChapter,
  onReprocessed,
}: StoryChaptersPanelProps) {
  const [chapters, setChapters] = useState<StoryChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rebuildNote, setRebuildNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await storyChaptersApi.list({ limit: 100 });
      if (res.success) setChapters(res.chapters);
    } catch {
      setError('Story chapters not available yet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRebuild = async () => {
    setRebuilding(true);
    setRebuildNote(null);
    setError(null);
    try {
      const res = await storyChaptersApi.reprocess();
      setChapters(res.chapters ?? []);
      onReprocessed?.(res.chapters ?? []);
      setRebuildNote(
        res.published > 0
          ? `Rebuilt ${res.published} owned chapter${res.published === 1 ? '' : 's'}`
          : res.scenes === 0
            ? 'No scenes to assemble yet'
            : `Assembled ${res.assembled}, none passed ownership yet`,
      );
    } catch {
      setError('Could not rebuild story chapters.');
    } finally {
      setRebuilding(false);
    }
  };

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
          {chapters.length} owned
        </span>
        <button
          type="button"
          onClick={() => void handleRebuild()}
          disabled={rebuilding}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-white/50 hover:text-white/80 hover:border-white/30 disabled:opacity-50"
          title="Rebuild chapters with Narrative Ownership"
          data-testid="story-chapters-rebuild"
        >
          {rebuilding ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Rebuild
        </button>
      </div>

      {rebuildNote && (
        <p className="text-[10px] text-amber-200/70 mb-2" data-testid="story-chapters-rebuild-note">
          {rebuildNote}
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 text-white/40 text-xs mb-2">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      {chapters.length === 0 ? (
        <div className="flex items-center gap-2 text-white/40 text-xs">
          <AlertCircle className="h-3.5 w-3.5" />
          Chapters appear when Scenes pass Narrative Ownership. Try Rebuild after new scenes land.
        </div>
      ) : (
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
      )}
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
  const ownership = getChapterOwnership(chapter);
  const contributions = getChapterContributions(chapter)
    .slice()
    .sort((a, b) => b.strength - a.strength);

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
          <p className="text-[10px] text-amber-300/70 uppercase tracking-widest font-mono mb-1 capitalize">
            {domainLabel(ownership?.domain)} chapter
          </p>
          <h2 className="text-lg font-semibold text-white/95">{chapter.title}</h2>
          <p className="text-xs text-white/40 mt-1 font-mono">
            {formatRange(chapter.time_start, chapter.time_end)}
          </p>
        </div>
      </div>
      <div className="px-4 sm:px-8 py-6 max-w-2xl space-y-5">
        {(ownership?.primaryNarrative || chapter.thesis) && (
          <p className="text-base text-white/80 leading-relaxed italic">
            {ownership?.primaryNarrative || chapter.thesis}
          </p>
        )}

        <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-3 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-amber-300/70 font-mono">
            Narrative ownership
          </p>
          {ownership?.primarySubject ? (
            <p className="text-xs text-white/70">
              <span className="text-white/40">Subject · </span>
              {ownership.primarySubject}
            </p>
          ) : (
            <p className="text-xs text-white/40">Subject not yet declared</p>
          )}
          {ownership?.primaryConflict && (
            <p className="text-xs text-white/70">
              <span className="text-white/40">Conflict · </span>
              {ownership.primaryConflict}
            </p>
          )}
          {ownership?.primaryOutcome && (
            <p className="text-xs text-white/70">
              <span className="text-white/40">Outcome · </span>
              {ownership.primaryOutcome}
            </p>
          )}
          {ownership?.domain && ownership.domain !== 'unknown' && (
            <p className="text-xs text-white/70 capitalize">
              <span className="text-white/40">Domain · </span>
              {domainLabel(ownership.domain)}
            </p>
          )}
        </div>

        <p className="text-sm text-white/65 leading-relaxed">{chapter.summary}</p>

        {contributions.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-white/40 font-mono">
              Scene contributions
            </p>
            <ul className="space-y-1.5">
              {contributions.map((c) => (
                <li
                  key={c.sceneId}
                  className="flex items-center gap-2 text-xs text-white/55"
                >
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded border capitalize',
                      c.classification === 'supporting'
                        ? 'border-amber-400/30 text-amber-200/80 bg-amber-500/10'
                        : 'border-white/10 text-white/40 bg-white/5',
                    )}
                  >
                    {c.classification}
                  </span>
                  <span className="font-mono text-white/35">{Math.round(c.strength)}</span>
                  <span className="font-mono text-white/25 truncate">{c.sceneId.slice(0, 8)}…</span>
                </li>
              ))}
            </ul>
          </div>
        )}

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
