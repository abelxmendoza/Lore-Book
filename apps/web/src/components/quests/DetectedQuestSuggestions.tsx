/**
 * DetectedQuestSuggestions — compact rectangular bars for chat-detected quests.
 * Used on the Quest Board (quest-board-suggestions).
 */

import { useMemo, useState } from 'react';
import { Sparkles, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../ui/button';
import { useToast } from '../ui/toast';
import { useCreateQuest, useQuestSuggestions } from '../../hooks/useQuests';
import { suggestionDismissApi } from '../../api/suggestionDismiss';
import { useSuggestionRescan } from '../../hooks/useSuggestionRescan';
import { filterVisibleSuggestions } from '../../lib/suggestionBookFilter';
import { SuggestionMergeHint, suggestionPrimaryActionLabel } from '../suggestions/SuggestionMergeHint';
import { SuggestionCategoryRedirect } from '../suggestions/SuggestionCategoryRedirect';
import { isSimilarSuggestion } from '../../lib/suggestionMatchTypes';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { mockDataService } from '../../services/mockDataService';
import { RescanChatsButton } from '../suggestions/RescanChatsButton';
import { SuggestionPanelEmptyState } from '../suggestions/SuggestionPanelEmptyState';
import { useSuggestionPanelDismissal } from '../../hooks/useSuggestionPanelDismissal';
import type { QuestSuggestion } from '../../types/quest';
import { cn } from '../../lib/cn';

const TYPE_LABELS: Record<string, string> = {
  main: 'Main',
  side: 'Side',
  daily: 'Daily',
  achievement: 'Achievement',
};

const TYPE_COLORS: Record<string, string> = {
  main: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
  side: 'border-blue-400/40 bg-blue-500/15 text-blue-200',
  daily: 'border-green-400/40 bg-green-500/15 text-green-200',
  achievement: 'border-purple-400/40 bg-purple-500/15 text-purple-200',
};

function suggestionKey(suggestion: QuestSuggestion): string {
  return suggestion.id ?? suggestion.title;
}

interface DetectedQuestSuggestionsProps {
  onQuestAdded?: () => void;
  /** Titles already on the board — hide matching suggestions. */
  existingQuestTitles?: string[];
  existingBookEntries?: Array<{ id?: string; name: string }>;
  demoMode?: boolean;
}

export function DetectedQuestSuggestions({
  onQuestAdded,
  existingQuestTitles = [],
  existingBookEntries = [],
  demoMode,
}: DetectedQuestSuggestionsProps) {
  const { success, error, ToastContainer } = useToast();
  const shouldUseMock = useShouldUseMockData();
  const showDemo = demoMode ?? shouldUseMock;
  const { data: suggestions = [], isLoading, refetch } = useQuestSuggestions();
  const { rescan: rescanChats, rescanning } = useSuggestionRescan('quests', {
    notify: { success, error },
    showToast: false,
  });
  const createQuest = useCreateQuest();
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  const bookEntries = useMemo(() => {
    if (existingBookEntries.length > 0) return existingBookEntries;
    return existingQuestTitles.map((title) => ({ name: title }));
  }, [existingBookEntries, existingQuestTitles]);

  const visible = useMemo(
    () =>
      filterVisibleSuggestions(
        suggestions.filter((suggestion) => {
          const key = suggestionKey(suggestion);
          return !dismissed.has(key);
        }),
        (s) => s.title,
        bookEntries
      ),
    [suggestions, dismissed, bookEntries]
  );

  const { hidePanel, dismissEmptyPanel, reopenPanel } = useSuggestionPanelDismissal(
    'quests',
    visible.length,
    { loading: isLoading, scanning: rescanning },
  );

  const handleRescan = async () => {
    if (showDemo) return;
    reopenPanel();
    await rescanChats();
    await refetch();
    window.dispatchEvent(new CustomEvent('lk:quests-updated', { detail: {} }));
  };

  const handleAdd = async (suggestion: QuestSuggestion) => {
    const key = suggestionKey(suggestion);
    if (isSimilarSuggestion(suggestion)) {
      setDismissed((prev) => new Set([...prev, key]));
      return;
    }
    setAdding(key);
    try {
      await createQuest.mutateAsync({
        title: suggestion.title,
        description: suggestion.description,
        quest_type: suggestion.quest_type,
        priority: suggestion.priority ?? 5,
        importance: suggestion.importance ?? 5,
        impact: suggestion.impact ?? 5,
        source: 'suggested',
      });
      if (showDemo) {
        mockDataService.mutate.questSuggestions.remove({
          id: suggestion.id,
          title: suggestion.title,
        });
      }
      setDismissed((prev) => new Set([...prev, key]));
      success(`"${suggestion.title}" is now in your quest log.`);
      onQuestAdded?.();
    } catch {
      error('Could not add quest. Please try again.');
    } finally {
      setAdding(null);
    }
  };

  const handleDismiss = async (suggestion: QuestSuggestion) => {
    const key = suggestionKey(suggestion);
    setDismissed((prev) => new Set([...prev, key]));
    if (showDemo) return;
    try {
      await suggestionDismissApi.dismiss({
        bookDomain: 'quests',
        name: suggestion.title,
        suggestionId: suggestion.id,
        sourceMessageId: suggestion.source_message_id,
      });
    } catch {
      /* non-blocking */
    }
  };

  if (isLoading && visible.length === 0 && !rescanning) return null;
  if (hidePanel) return <ToastContainer />;

  return (
    <>
      <ToastContainer />
      <div
        data-testid="quest-board-suggestions"
        className="rounded-lg border border-amber-500/25 bg-gradient-to-br from-amber-950/30 via-black/40 to-black/50 overflow-hidden"
      >
        <div className="flex w-full items-center justify-between gap-2 px-2.5 py-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:opacity-90 transition-opacity"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="truncate text-xs font-semibold text-white sm:text-sm">
              Suggested quests
            </span>
            {visible.length > 0 && (
              <span className="shrink-0 rounded-full bg-amber-500/25 px-1.5 py-px text-[10px] font-mono text-amber-200">
                {visible.length}
              </span>
            )}
            {showDemo && (
              <span className="shrink-0 rounded-full border border-amber-500/30 px-1.5 py-px text-[9px] font-mono uppercase text-amber-200/80">
                Demo
              </span>
            )}
          </button>
          <div className="flex shrink-0 items-center gap-1">
            {!showDemo && (
              <RescanChatsButton
                compact
                rescanning={rescanning}
                disabled={isLoading}
                title="Rescan my chats for quests"
                onClick={() => void handleRescan()}
              />
            )}
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="rounded p-1 text-white/40 hover:text-white/70 hover:bg-white/5"
              aria-label={collapsed ? 'Expand suggestions' : 'Collapse suggestions'}
            >
              {collapsed ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="px-2 pb-2 sm:px-2.5 space-y-1.5">
            {(isLoading || rescanning) && visible.length === 0 ? (
              <p className="text-[10px] text-white/45 py-1">
                {rescanning ? 'Re-reading your story for new quests…' : 'Loading quest suggestions…'}
              </p>
            ) : visible.length === 0 ? (
              <SuggestionPanelEmptyState
                message="No pending quest suggestions. Use rescan to replay your chats through the quest detector."
                onDismiss={dismissEmptyPanel}
                onRescan={showDemo ? undefined : () => void handleRescan()}
                rescanning={rescanning}
                rescanLabel="Rescan for quests"
              />
            ) : (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {visible.map((suggestion) => {
                  const key = suggestionKey(suggestion);
                  const isAdding = adding === key;
                  const typeColor = TYPE_COLORS[suggestion.quest_type] ?? TYPE_COLORS.side;

                  return (
                    <article
                      key={key}
                      title={suggestion.reasoning}
                      className={cn(
                        'flex items-center gap-2 rounded-md border border-amber-500/20 bg-black/35 px-2 py-1.5',
                        'hover:border-amber-500/35 hover:bg-black/45 transition-colors',
                      )}
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1 min-w-0">
                          <span
                            className={cn(
                              'shrink-0 rounded border px-1 py-px text-[8px] font-semibold uppercase tracking-wide',
                              typeColor,
                            )}
                          >
                            {TYPE_LABELS[suggestion.quest_type] ?? suggestion.quest_type}
                          </span>
                          <SuggestionMergeHint item={suggestion} bookLabel="Quest Board" className="shrink-0" />
                          <h3 className="truncate text-[11px] font-semibold text-white leading-tight sm:text-xs">
                            {suggestion.title}
                          </h3>
                        </div>
                        {suggestion.description && (
                          <p className="line-clamp-1 text-[10px] leading-snug text-white/45">
                            {suggestion.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[9px] text-white/35">
                          <span>{Math.round((suggestion.confidence ?? 0) * 100)}%</span>
                          {suggestion.priority != null && (
                            <>
                              <span>·</span>
                              <span>P{suggestion.priority}</span>
                            </>
                          )}
                        </div>
                        <SuggestionCategoryRedirect
                          name={suggestion.title}
                          fromDomain="quests"
                          suggestionId={suggestion.id}
                          alternatives={suggestion.alternative_categories}
                          description={suggestion.description}
                          evidence={suggestion.reasoning}
                          disabled={isAdding}
                          onReclassified={() => void handleDismiss(suggestion)}
                          className="mt-1"
                        />
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        {isSimilarSuggestion(suggestion) ? (
                          <span className="text-[9px] text-amber-200/75 px-1">Already tracked</span>
                        ) : (
                          <Button
                            size="sm"
                            disabled={isAdding}
                            onClick={() => void handleAdd(suggestion)}
                            className="h-6 px-2 text-[10px] bg-amber-600/80 hover:bg-amber-500 text-white"
                          >
                            {isAdding ? '…' : <Plus className="h-3 w-3" />}
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDismiss(suggestion)}
                          className="rounded p-0.5 text-white/30 hover:text-white/60 hover:bg-white/5"
                          aria-label="Dismiss"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
