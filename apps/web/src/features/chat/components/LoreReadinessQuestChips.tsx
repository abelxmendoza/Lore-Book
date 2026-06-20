import { BookOpen, ChevronDown, ChevronUp, Loader2, Sparkles, X } from 'lucide-react';
import { useLoreReadinessQuests } from '../../../hooks/useLoreReadinessQuests';
import { useLoreReadinessQuestsDismiss } from '../../../hooks/useLoreReadinessQuestsDismiss';
import { cn } from '../../../lib/cn';

type LoreReadinessQuestChipsProps = {
  onSelectPrompt: (prompt: string) => void;
  className?: string;
  compact?: boolean;
};

export const LoreReadinessQuestChips = ({
  onSelectPrompt,
  className,
  compact = false,
}: LoreReadinessQuestChipsProps) => {
  const { quests, loading } = useLoreReadinessQuests(true);
  const { dismissed, dismiss, collapsed, toggleCollapsed } = useLoreReadinessQuestsDismiss();

  if (dismissed) return null;

  if (loading && quests.length === 0) {
    return (
      <div className={cn('px-3 py-2 text-[11px] text-white/35 flex items-center gap-2', className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking lorebook readiness…
      </div>
    );
  }

  if (quests.length === 0) return null;

  return (
    <div className={cn('border-b border-violet-500/15 bg-violet-950/20', className)}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-3 py-2 sm:px-4 lg:px-10 xl:px-12">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="lore-readiness-quest-list"
            data-testid="lore-readiness-quests-toggle"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 text-left transition-colors hover:bg-white/5"
          >
            <Sparkles className="h-3 w-3 shrink-0 text-violet-300/80" />
            <span className="truncate text-[10px] font-mono uppercase tracking-widest text-violet-300/70">
              Fill knowledge gaps for lorebooks
            </span>
            <span className="shrink-0 rounded-full bg-violet-500/20 px-1.5 py-px text-[10px] font-mono text-violet-200/90">
              {quests.length}
            </span>
            {collapsed ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-violet-300/50" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 text-violet-300/50" />
            )}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss lorebook gap suggestions"
            data-testid="lore-readiness-quests-dismiss"
            className="shrink-0 rounded-md p-1 text-violet-300/50 transition-colors hover:bg-white/10 hover:text-violet-200/90"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {!collapsed && (
          <div
            id="lore-readiness-quest-list"
            className={cn('flex gap-2', compact ? 'flex-col' : 'flex-col sm:flex-row sm:flex-wrap')}
          >
            {quests.map((quest) => (
              <button
                key={quest.id}
                type="button"
                onClick={() => onSelectPrompt(quest.prompt)}
                className="group flex min-w-0 flex-1 items-start gap-2 rounded-xl border border-violet-500/20 bg-black/30 px-3 py-2 text-left transition-colors hover:border-violet-400/40 hover:bg-violet-500/10"
              >
                <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400/80" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-mono text-violet-300/60">
                    {quest.label} · {Math.round(quest.progress * 100)}%
                  </span>
                  <span className="block text-xs text-white/75 leading-snug line-clamp-2">{quest.prompt}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
