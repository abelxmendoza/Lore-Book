import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Plus, X, ChevronDown, ChevronUp, RefreshCw, User, Check, Loader2 } from 'lucide-react';
import { characterSuggestionsApi, type CharacterSuggestion } from '../../api/entitySuggestions';
import { suggestionDismissApi } from '../../api/suggestionDismiss';
import { suggestionRescanApi } from '../../api/suggestionRescan';
import { appendLorebookParseToast } from '../../lib/suggestionRescanToast';
import { apiCache } from '../../lib/cache';
import { filterVisibleSuggestions } from '../../lib/suggestionBookFilter';
import { SuggestionMergeHint, suggestionPrimaryActionLabel } from '../suggestions/SuggestionMergeHint';
import { SuggestionCategoryRedirect } from '../suggestions/SuggestionCategoryRedirect';
import { isSimilarSuggestion, suggestionMatchedId, suggestionMatchedName } from '../../lib/suggestionMatchTypes';
import { isIndividualPersonName } from '../../lib/personNameValidation';
import { getMockCharacterSuggestions } from '../../mocks/characterSuggestions';
import { useGetCharactersBookQuery } from '../../store/api/entitiesApi';
import { invalidateEntityTags } from '../../store/invalidateEntityCache';
import { RomanticAddCelebration } from '../love/RomanticAddCelebration';

type Props = {
  onCharacterAdded?: (suggestion: CharacterSuggestion) => void;
  onRescanComplete?: (summary?: {
    charactersPromoted: number;
    restoredFromEvidence: number;
  }) => void;
  demoMode?: boolean;
  /** Names already in the Characters book — hide matching suggestions. */
  existingCharacterNames?: string[];
  /** Book entries with ids for merge hints (preferred over name list). */
  existingBookEntries?: Array<{ id: string; name: string; aliases?: string[] }>;
  /** Love & Relationships uses romantic-only individual suggestions. */
  variant?: 'general' | 'romantic';
};

const SOURCE_LABEL: Record<CharacterSuggestion['source'], string> = {
  omega_entity: 'Detected person',
  entity_question: 'Needs confirmation',
  chat_extract: 'From recent chats',
};

const keyFor = (s: CharacterSuggestion) => s.id;

export const DetectedCharacterSuggestions = ({
  onCharacterAdded,
  onRescanComplete,
  demoMode = false,
  existingCharacterNames = [],
  existingBookEntries = [],
  variant = 'general',
}: Props) => {
  const showDemo = demoMode;
  const [suggestions, setSuggestions] = useState<CharacterSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [exiting, setExiting] = useState<Set<string>>(new Set());
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [rescanNotice, setRescanNotice] = useState<string | null>(null);
  const { dataUpdatedAt } = useGetCharactersBookQuery(undefined, { skip: showDemo });

  const fetchSuggestions = useCallback(async (opts?: { rescan?: boolean }) => {
    if (showDemo) {
      setSuggestions(getMockCharacterSuggestions(variant));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await characterSuggestionsApi.list(
        variant === 'romantic'
          ? { context: 'romantic', rescan: opts?.rescan }
          : { rescan: opts?.rescan }
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
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchSuggestions();
      }
    }, 5 * 60 * 1000);
    return () => {
      clearInterval(interval);
    };
  }, [fetchSuggestions, dataUpdatedAt]);

  useEffect(() => {
    if (!successNotice) return;
    const timer = window.setTimeout(() => setSuccessNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  const bookEntries = useMemo(() => {
    if (existingBookEntries.length > 0) return existingBookEntries;
    return existingCharacterNames.map((name) => ({ id: undefined, name }));
  }, [existingBookEntries, existingCharacterNames]);

  const visible = useMemo(
    () =>
      filterVisibleSuggestions(
        suggestions
          .filter(s => s.name?.trim())
          .filter(s => isIndividualPersonName(s.name))
          .filter(s => !dismissed.has(keyFor(s)) && !added.has(keyFor(s))),
        (s) => s.name,
        bookEntries
      )
        .sort((a, b) => (b.confidence - a.confidence) || (b.mentionCount - a.mentionCount))
        .slice(0, 12),
    [suggestions, dismissed, added, bookEntries]
  );

  const panelTitle =
    variant === 'romantic'
      ? 'Romantic interests detected in your chats'
      : 'People detected in your chats';

  const handleRescan = async () => {
    if (showDemo) {
      setRescanNotice(
        variant === 'romantic'
          ? 'Demo mode — sign in to rescan your real love story from conversations.'
          : 'Demo mode — sign in to rescan your real conversations.'
      );
      return;
    }
    setRescanning(true);
    setRescanNotice(null);
    setError(null);
    try {
      apiCache.deletePattern(/\/api\/(characters|knowledge|conversation\/romantic|quests|locations|skills|projects)/);
      if (variant === 'romantic') {
        const { summary } = await suggestionRescanApi.rescan(['romantic', 'characters']);
        const romantic = summary.results.romantic as { relationshipsUpserted?: number; romanticEpisodes?: number } | undefined;
        const total = romantic?.relationshipsUpserted ?? 0;
        const episodes = romantic?.romanticEpisodes ?? 0;
        setRescanNotice(
          appendLorebookParseToast(
            total > 0
              ? `Love story rescan — ${total} relationship${total === 1 ? '' : 's'} updated from ${episodes} romantic episode${episodes === 1 ? '' : 's'}.`
              : 'Love story rescan complete — relationships are up to date.',
            summary
          )
        );
        invalidateEntityTags(['Character']);
      } else {
        const { summary } = await suggestionRescanApi.rescan(['characters']);
        const charSummary = summary.results.characters as {
          charactersPromoted?: number;
          restoredFromEvidence?: number;
        } | undefined;
        const promoted = charSummary?.charactersPromoted ?? 0;
        const restored = charSummary?.restoredFromEvidence ?? 0;
        const total = promoted + restored;
        setRescanNotice(
          appendLorebookParseToast(
            total > 0
              ? `Rescan found ${total} character${total === 1 ? '' : 's'} to add or restore.`
              : 'Rescan complete — your cast is up to date.',
            summary
          )
        );
        onRescanComplete?.({ charactersPromoted: promoted, restoredFromEvidence: restored });
      }
      await fetchSuggestions({ rescan: false });
      invalidateEntityTags(['Character']);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversation rescan failed');
    } finally {
      setRescanning(false);
    }
  };

  const handleAdd = async (s: CharacterSuggestion) => {
    const k = keyFor(s);
    if (isSimilarSuggestion(s)) {
      const targetId = suggestionMatchedId(s);
      setDismissed(prev => new Set(prev).add(k));
      if (targetId) {
        window.dispatchEvent(
          new CustomEvent('lk:suggest-merge:characters', {
            detail: { targetId, suggestionName: s.name },
          })
        );
      }
      setRescanNotice(
        suggestionMatchedName(s)
          ? `Use the merge panel below to combine “${s.name}” with ${suggestionMatchedName(s)}.`
          : 'Use the merge panel below to combine possible duplicates.'
      );
      return;
    }
    setAdding(k);
    setError(null);
    try {
      if (showDemo) {
        await new Promise(resolve => window.setTimeout(resolve, 680));
      } else {
        apiCache.deletePattern(/\/api\/(characters|knowledge)/);
        await characterSuggestionsApi.add(s);
      }

      if (variant === 'romantic') {
        setCelebrate(true);
        setSuccessNotice(`${s.name} added to your love story`);
      } else if (showDemo) {
        setSuccessNotice(`${s.name} added to your Character Book (demo)`);
      }

      setExiting(prev => new Set(prev).add(k));
      await new Promise(resolve => window.setTimeout(resolve, 360));

      setAdded(prev => new Set(prev).add(k));
      onCharacterAdded?.(s);
      invalidateEntityTags(['Character']);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add character');
      setExiting(prev => {
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
    } finally {
      setAdding(null);
    }
  };

  const handleDismiss = async (s: CharacterSuggestion) => {
    const k = keyFor(s);
    setDismissed(prev => new Set(prev).add(k));
    if (showDemo) return;
    try {
      await suggestionDismissApi.dismiss({
        bookDomain: 'characters',
        name: s.name,
        suggestionId: s.id,
      });
    } catch {
      /* non-blocking */
    }
  };

  return (
    <>
      {variant === 'romantic' && (
        <RomanticAddCelebration
          active={celebrate}
          label={successNotice ?? undefined}
          onDone={() => setCelebrate(false)}
        />
      )}
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
            onClick={() => void handleRescan()}
            disabled={loading || rescanning}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
            title={variant === 'romantic' ? 'Rescan conversations for romantic relationships' : 'Rescan all conversations to find new or missing characters'}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${rescanning ? 'animate-spin' : ''}`} />
            {rescanning ? 'Rescanning…' : variant === 'romantic' ? 'Rescan love story' : 'Rescan conversations'}
          </button>
          <button
            type="button"
            onClick={() => void handleRescan()}
            disabled={loading || rescanning}
            className="sm:hidden h-8 w-8 flex items-center justify-center rounded text-white/50 hover:text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
            title="Rescan conversations"
            aria-label="Rescan conversations"
          >
            <RefreshCw className={`h-4 w-4 ${rescanning ? 'animate-spin' : ''}`} />
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
          {showDemo && (
            <p className="text-[11px] text-amber-200/70 leading-relaxed rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              LoreBook scanned fictional sample conversations and found people not in the demo Character Book yet. Tap Add to preview how confirmation works.
            </p>
          )}
          {error && (
            <p className="text-xs text-red-400 rounded border border-red-500/30 bg-red-500/10 px-3 py-2">{error}</p>
          )}
          {rescanNotice && (
            <p className="text-xs text-emerald-200 rounded border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">
              {rescanNotice}
            </p>
          )}
          {successNotice && variant !== 'romantic' && (
            <p className="flex items-center gap-2 text-xs text-pink-100 rounded border border-pink-500/30 bg-pink-500/10 px-3 py-2 animate-romantic-enter">
              <Check className="h-3.5 w-3.5 text-pink-300 shrink-0" />
              {successNotice}
            </p>
          )}
          {loading && visible.length === 0 ? (
            <p className="text-xs text-white/40 py-2">Scanning your conversations…</p>
          ) : visible.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-3 space-y-2">
              <p className="text-xs text-white/55 leading-relaxed">
                No new people to add right now. Rescan your full chat and journal history to surface anyone missing from your book — including characters removed by mistake.
              </p>
              <button
                type="button"
                onClick={() => void handleRescan()}
                disabled={rescanning}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-[11px] font-medium text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${rescanning ? 'animate-spin' : ''}`} />
                {rescanning ? 'Rescanning conversations…' : 'Rescan conversations'}
              </button>
            </div>
          ) : (
            <div className={variant === 'romantic' ? 'grid grid-cols-2 gap-2 lg:grid-cols-3' : 'space-y-2'}>
            {visible.map(s => {
              const k = keyFor(s);
              const isExiting = exiting.has(k);
              const isAdding = adding === k;
              return (
                <div
                  key={k}
                  className={
                    variant === 'romantic'
                      ? `flex h-full flex-col gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2.5 sm:px-3 transition-all ${
                          isExiting ? 'animate-romantic-exit pointer-events-none' : ''
                        } ${isAdding ? 'ring-2 ring-pink-500/40 ring-offset-1 ring-offset-black/80' : ''}`
                      : `flex items-start gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 ${
                          isExiting ? 'animate-romantic-exit pointer-events-none' : ''
                        }`
                  }
                >
                  {variant === 'romantic' ? (
                    <>
                      <div className="flex items-start gap-2">
                        <User className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300/80" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{s.name}</p>
                          {s.context && (
                            <p className="mt-0.5 line-clamp-2 text-[10px] text-white/45 sm:text-[11px]">{s.context}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="rounded border border-amber-500/20 bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-200/80">
                          {SOURCE_LABEL[s.source]}
                        </span>
                        <SuggestionMergeHint item={s} bookLabel="Character Book" />
                        {s.mentionCount > 1 && (
                          <span className="text-[9px] text-white/35">{s.mentionCount} mentions</span>
                        )}
                      </div>
                      <SuggestionCategoryRedirect
                        name={s.name}
                        fromDomain="characters"
                        suggestionId={s.id}
                        alternatives={s.alternative_categories}
                        context={s.context}
                        disabled={isAdding || isExiting}
                        onReclassified={() => void handleDismiss(s)}
                      />
                      <div className="mt-auto flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Add ${s.name}`}
                          onClick={() => void handleAdd(s)}
                          disabled={isAdding || isExiting}
                          className="flex flex-1 items-center justify-center gap-1 rounded border border-amber-500/30 bg-amber-500/20 px-2 py-1 text-[10px] font-medium text-amber-100 hover:bg-amber-500/30 disabled:opacity-50 sm:text-[11px] transition-colors"
                        >
                          {isAdding ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Adding…
                            </>
                          ) : (
                            <>
                              <Plus className="h-3 w-3" />
                              {suggestionPrimaryActionLabel({ item: s, addLabel: 'Add' })}
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDismiss(s)}
                          className="rounded p-1 text-white/30 hover:bg-white/10 hover:text-white/70"
                          aria-label="Dismiss"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
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
                      <SuggestionMergeHint item={s} bookLabel="Character Book" />
                      {s.mentionCount > 1 && (
                        <span className="text-[9px] text-white/35">{s.mentionCount} mentions</span>
                      )}
                    </div>
                    <SuggestionCategoryRedirect
                      name={s.name}
                      fromDomain="characters"
                      suggestionId={s.id}
                      alternatives={s.alternative_categories}
                      context={s.context}
                      disabled={isAdding || isExiting}
                      onReclassified={() => void handleDismiss(s)}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      aria-label={`Add ${s.name}`}
                      onClick={() => void handleAdd(s)}
                      disabled={isAdding || isExiting}
                      className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 border border-amber-500/30 disabled:opacity-50"
                    >
                      {isAdding ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Adding…
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" />
                          {suggestionPrimaryActionLabel({ item: s, addLabel: 'Add' })}
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDismiss(s)}
                      className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/10"
                      aria-label="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                    </>
                  )}
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
};
