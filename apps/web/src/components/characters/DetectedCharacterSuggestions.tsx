import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Plus, X, ChevronDown, ChevronUp, RefreshCw, User } from 'lucide-react';
import { characterSuggestionsApi, type CharacterSuggestion } from '../../api/entitySuggestions';
import { isNameAlreadyInBookList } from '../../lib/suggestionBookFilter';
import { isIndividualPersonName } from '../../lib/personNameValidation';
import { getMockCharacterSuggestions } from '../../mocks/characterSuggestions';

type Props = {
  onCharacterAdded?: () => void;
  demoMode?: boolean;
  /** Names already in the Characters book — hide matching suggestions. */
  existingCharacterNames?: string[];
  /** Love & Relationships uses romantic-only individual suggestions. */
  variant?: 'general' | 'romantic';
};

const SOURCE_LABEL: Record<CharacterSuggestion['source'], string> = {
  omega_entity: 'Detected person',
  entity_question: 'Needs confirmation',
  chat_extract: 'From recent chats',
};

const keyFor = (s: CharacterSuggestion) =>
  `${s.name}__${s.omegaEntityId ?? s.questionId ?? ''}`.toLowerCase();

export const DetectedCharacterSuggestions = ({
  onCharacterAdded,
  demoMode = false,
  existingCharacterNames = [],
  variant = 'general',
}: Props) => {
  const showDemo = demoMode;
  const [suggestions, setSuggestions] = useState<CharacterSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (showDemo) {
      setSuggestions(getMockCharacterSuggestions(variant));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await characterSuggestionsApi.list(
        variant === 'romantic' ? { context: 'romantic' } : undefined
      );
      setSuggestions(res.suggestions ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [showDemo, variant]);

  useEffect(() => {
    void fetchSuggestions();
    const interval = setInterval(() => { void fetchSuggestions(); }, 5 * 60 * 1000);
    const onRefresh = () => { void fetchSuggestions(); };
    window.addEventListener('lk:characters-updated', onRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('lk:characters-updated', onRefresh);
    };
  }, [fetchSuggestions]);

  const visible = useMemo(
    () =>
      suggestions
        .filter(s => s.name?.trim())
        .filter(s => isIndividualPersonName(s.name))
        .filter(s => !dismissed.has(keyFor(s)) && !added.has(keyFor(s)))
        .filter(s => !existingCharacterNames.length || !isNameAlreadyInBookList(s.name, existingCharacterNames))
        .sort((a, b) => (b.confidence - a.confidence) || (b.mentionCount - a.mentionCount))
        .slice(0, 12),
    [suggestions, dismissed, added, existingCharacterNames]
  );

  const panelTitle =
    variant === 'romantic'
      ? 'Romantic interests detected in your chats'
      : 'People detected in your chats';

  if (!loading && visible.length === 0) return null;

  const handleAdd = async (s: CharacterSuggestion) => {
    const k = keyFor(s);
    setAdding(k);
    setError(null);
    try {
      if (!showDemo) {
        await characterSuggestionsApi.add(s);
      }
      setAdded(prev => new Set(prev).add(k));
      onCharacterAdded?.();
      window.dispatchEvent(new Event('lk:characters-updated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add character');
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="rounded-lg border border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-black/40 to-black/40 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <h3 className="text-sm sm:text-base font-semibold text-white truncate">
            {panelTitle}
          </h3>
          {!loading && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-200 font-mono">
              {visible.length}
            </span>
          )}
          {showDemo && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-200/90 border border-yellow-500/25">
              Demo
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => void fetchSuggestions()}
            disabled={loading}
            className="h-8 w-8 flex items-center justify-center rounded text-white/50 hover:text-amber-300 hover:bg-amber-500/10"
            title="Re-scan conversations"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className="h-8 w-8 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/10"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 sm:px-4 pb-4 space-y-2">
          {error && (
            <p className="text-xs text-red-400 rounded border border-red-500/30 bg-red-500/10 px-3 py-2">{error}</p>
          )}
          {loading && visible.length === 0 ? (
            <p className="text-xs text-white/40 py-2">Scanning your conversations…</p>
          ) : (
            visible.map(s => {
              const k = keyFor(s);
              return (
                <div
                  key={k}
                  className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5"
                >
                  <User className="h-4 w-4 text-amber-300/80 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{s.name}</p>
                    {s.context && (
                      <p className="text-[11px] text-white/45 line-clamp-2 mt-0.5">{s.context}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200/80 border border-amber-500/20">
                        {SOURCE_LABEL[s.source]}
                      </span>
                      {s.mentionCount > 1 && (
                        <span className="text-[9px] text-white/35">{s.mentionCount} mentions</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleAdd(s)}
                      disabled={adding === k}
                      className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 border border-amber-500/30 disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissed(prev => new Set(prev).add(k))}
                      className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/10"
                      aria-label="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
