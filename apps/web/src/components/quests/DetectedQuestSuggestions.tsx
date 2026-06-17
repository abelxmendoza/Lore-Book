// =====================================================
// DETECTED QUEST SUGGESTIONS
// Quests LoreBook detected in chats/journal — confirm before they enter the log.
// =====================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Plus, X, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { questsApi } from '../../api/quests';
import { clampQuestScore, normalizeQuestType, optionalQuestString } from '../../lib/questNormalize';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import type { QuestSuggestion } from '../../types/quest';

interface Props {
  onQuestAdded?: () => void;
  existingQuestTitles?: string[];
}

const TYPE_COLORS: Record<string, string> = {
  main: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  side: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  daily: 'bg-primary/20 text-primary border-primary/40',
  weekly: 'bg-secondary/20 text-secondary border-secondary/40',
  achievement: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
};
const typeColor = (t?: string) => TYPE_COLORS[t ?? ''] ?? 'bg-white/10 text-white/60 border-white/20';

const keyFor = (s: QuestSuggestion) => s.id ?? `${s.title}__${s.quest_type}`.toLowerCase();

export const DetectedQuestSuggestions = ({ onQuestAdded, existingQuestTitles = [] }: Props) => {
  const [suggestions, setSuggestions] = useState<QuestSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async (opts?: { rescan?: boolean; silent?: boolean }) => {
    if (opts?.rescan) setRescanning(true);
    else if (!opts?.silent) setLoading(true);
    try {
      setSuggestions(await questsApi.getSuggestions({ rescan: opts?.rescan }));
    } catch {
      if (!opts?.silent) setSuggestions([]);
    } finally {
      setLoading(false);
      setRescanning(false);
    }
  }, []);

  useEffect(() => {
    void fetchSuggestions();
  }, [fetchSuggestions]);

  useEffect(() => {
    return onStoryDataUpdated(() => {
      void fetchSuggestions({ silent: true });
    }, 'quests');
  }, [fetchSuggestions]);

  const existingSet = useMemo(
    () => new Set(existingQuestTitles.map(t => t.trim().toLowerCase())),
    [existingQuestTitles]
  );

  const visible = useMemo(
    () =>
      suggestions
        .filter(s => s.title?.trim())
        .filter(s => !existingSet.has(s.title.trim().toLowerCase()))
        .filter(s => !dismissed.has(keyFor(s)) && !added.has(keyFor(s)))
        .sort((a, b) =>
          (b.confidence ?? 0) - (a.confidence ?? 0) ||
          (b.importance ?? 0) - (a.importance ?? 0) ||
          (b.priority ?? 0) - (a.priority ?? 0)
        )
        .slice(0, 12),
    [suggestions, dismissed, added, existingSet]
  );

  const handleAdd = async (s: QuestSuggestion) => {
    const k = keyFor(s);
    setAdding(k);
    setAddError(null);
    try {
      await questsApi.materializeSuggestion(s);
      setAdded(prev => new Set(prev).add(k));
      setSuggestions(prev => prev.filter(item => keyFor(item) !== k));
      onQuestAdded?.();
      window.dispatchEvent(new Event('lk:quests-updated'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add quest. Try again.';
      setAddError(message);
      console.error('Failed to add quest from suggestion:', err);
    } finally {
      setAdding(null);
    }
  };

  const handleDismiss = async (s: QuestSuggestion) => {
    const k = keyFor(s);
    setDismissed(prev => new Set(prev).add(k));
    setSuggestions(prev => prev.filter(item => keyFor(item) !== k));
    try {
      if (s.id) await questsApi.rejectSuggestion(s.id);
      else await questsApi.rejectSuggestionByTitle(s.title);
    } catch {
      /* non-blocking */
    }
  };

  if (!loading && !rescanning && visible.length === 0) return null;

  return (
    <div className="mx-2 sm:mx-4 mt-2 sm:mt-3 rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 via-black/40 to-black/40 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
          <h3 className="text-sm sm:text-base font-semibold text-white truncate">
            Detected from your chats
          </h3>
          {!loading && visible.length > 0 && (
            <span className="flex-shrink-0 text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full bg-primary/25 text-primary font-mono">
              {visible.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => void fetchSuggestions({ rescan: true })}
            disabled={loading || rescanning}
            className="h-8 w-8 flex items-center justify-center rounded text-white/50 hover:text-primary hover:bg-primary/10 transition-colors"
            title="Re-scan my chats for new quests"
          >
            <RefreshCw className={`h-4 w-4 ${rescanning ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className="h-8 w-8 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 sm:px-4 pb-4">
          {addError && (
            <p className="mb-3 text-xs text-red-400 font-mono rounded border border-red-500/30 bg-red-500/10 px-3 py-2">
              {addError}
            </p>
          )}
          {(loading || rescanning) && visible.length === 0 ? (
            <p className="text-xs text-white/50 font-mono py-3">
              {rescanning ? 'Re-reading your story for new quests…' : 'Reading your conversations…'}
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 max-h-[22rem] sm:max-h-[28rem] lg:max-h-[32rem] overflow-y-auto pr-1.5">
              {visible.map(s => {
                const k = keyFor(s);
                return (
                  <div
                    key={k}
                    className="relative rounded-lg border border-white/10 bg-black/40 p-3.5 sm:p-4 hover:border-primary/40 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => void handleDismiss(s)}
                      className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>

                    <div className="flex items-center gap-1.5 mb-1.5 pr-7 flex-wrap">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${typeColor(s.quest_type)}`}>
                        {String(normalizeQuestType(s.quest_type) ?? 'quest').toUpperCase()}
                      </span>
                      {typeof s.confidence === 'number' && (
                        <span className="text-[10px] text-white/40 font-mono">
                          {Math.round(s.confidence * 100)}% match
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-semibold text-white leading-snug mb-1">{s.title}</h4>
                    {s.description && (
                      <p className="text-xs text-white/60 leading-relaxed line-clamp-3 mb-2">{s.description}</p>
                    )}
                    {s.reasoning && (
                      <p className="text-[11px] text-white/40 italic leading-relaxed line-clamp-3 mb-3">
                        {s.reasoning}
                      </p>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/45 font-mono">
                        {s.priority != null && <span>PRI {clampQuestScore(s.priority)}</span>}
                        {s.importance != null && <span>IMP {clampQuestScore(s.importance)}</span>}
                        {s.impact != null && <span>IMPACT {clampQuestScore(s.impact)}</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleAdd(s)}
                        disabled={adding === k}
                        className="flex items-center justify-center gap-1 text-xs font-medium px-2.5 py-2 sm:py-1 rounded bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 transition-colors disabled:opacity-50 w-full sm:w-auto min-h-[40px] sm:min-h-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {adding === k ? 'Adding…' : 'Add to log'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
