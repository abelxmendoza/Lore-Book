import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Plus, X, ChevronDown, ChevronUp, RefreshCw, MapPin, Copy, Check } from 'lucide-react';
import { locationSuggestionsApi, type LocationSuggestion } from '../../api/entitySuggestions';
import { suggestionDismissApi } from '../../api/suggestionDismiss';
import { useSuggestionRescan } from '../../hooks/useSuggestionRescan';
import { apiCache } from '../../lib/cache';
import { filterVisibleSuggestions } from '../../lib/suggestionBookFilter';
import { SuggestionMergeHint, suggestionPrimaryActionLabel } from '../suggestions/SuggestionMergeHint';
import { SuggestionCategoryRedirect } from '../suggestions/SuggestionCategoryRedirect';
import { isSimilarSuggestion, suggestionMatchedId, suggestionMatchedName } from '../../lib/suggestionMatchTypes';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';
import { mockDataService } from '../../services/mockDataService';
import { useSuggestionPanelDismissal } from '../../hooks/useSuggestionPanelDismissal';
import { useVisiblePolling } from '../../hooks/useVisiblePolling';
import { SuggestionPanelEmptyState } from '../suggestions/SuggestionPanelEmptyState';
import { buildLocationSuggestionsClipboardText } from '../../lib/locationSuggestionsClipboard';
import { copyTextToClipboard } from '../../lib/listClipboard';
import { cn } from '../../lib/cn';

type Props = {
  onLocationAdded?: () => void;
  demoMode?: boolean;
  /** Names already in the Places book — hide matching suggestions. */
  existingLocationNames?: string[];
  existingBookEntries?: Array<{ id?: string; name: string; aliases?: string[] }>;
};

const SOURCE_LABEL: Record<LocationSuggestion['source'], string> = {
  chat_detect: 'From your chats',
  metadata: 'Journal tag',
};

const keyFor = (s: LocationSuggestion) => s.id;

const DEMO_SUGGESTIONS: LocationSuggestion[] = [
  {
    id: 'sug:location:the gym on main street:gym',
    name: 'The gym on Main Street',
    type: 'gym',
    mentionCount: 3,
    confidence: 0.8,
    source: 'chat_detect',
    context: 'Where you mentioned going twice a week',
  },
  {
    id: 'sug:location:kforce office:office',
    name: 'KForce office',
    type: 'office',
    mentionCount: 2,
    confidence: 0.74,
    source: 'chat_detect',
    context: 'Onboarding and paperwork visits',
  },
];

export const DetectedLocationSuggestions = ({ onLocationAdded, demoMode, existingLocationNames = [], existingBookEntries = [] }: Props) => {
  const isMock = useShouldUseMockData();
  const showDemo = demoMode ?? isMock;
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const { rescan: rescanChats, rescanning, RescanToastContainer } = useSuggestionRescan('locations');
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const fetchSuggestions = useCallback(async () => {
    if (showDemo) {
      const existing = mockDataService.get.locationSuggestions();
      const list = existing.length > 0 ? existing : DEMO_SUGGESTIONS;
      mockDataService.register.locationSuggestions(list);
      setSuggestions(list);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await locationSuggestionsApi.list();
      setSuggestions(res.suggestions ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [showDemo]);

  useEffect(() => {
    void fetchSuggestions();
    const onRefresh = () => { void fetchSuggestions(); };
    window.addEventListener('lk:locations-updated', onRefresh);
    return () => {
      window.removeEventListener('lk:locations-updated', onRefresh);
    };
  }, [fetchSuggestions]);

  // Background poll only while the tab is visible (was an always-on 5-min poll).
  useVisiblePolling(() => { void fetchSuggestions(); }, 5 * 60 * 1000, { immediate: false });

  const bookEntries = useMemo(() => {
    if (existingBookEntries.length > 0) return existingBookEntries;
    return existingLocationNames.map((name) => ({ name }));
  }, [existingBookEntries, existingLocationNames]);

  const visible = useMemo(
    () =>
      filterVisibleSuggestions(
        suggestions
          .filter(s => s.name?.trim())
          .filter(s => s.status !== 'rejected')
          .filter(s => !s.status || s.status === 'known' || s.status === 'new' || s.status === 'needs_review')
          .filter(s => !dismissed.has(keyFor(s)) && !added.has(keyFor(s))),
        (s) => s.name,
        bookEntries
      )
        .sort((a, b) => (b.confidence - a.confidence) || (b.mentionCount - a.mentionCount))
        .slice(0, 12),
    [suggestions, dismissed, added, bookEntries]
  );

  const { hidePanel, dismissEmptyPanel, reopenPanel } = useSuggestionPanelDismissal(
    'locations',
    visible.length,
    { loading, scanning: rescanning },
  );

  const handleRescan = useCallback(async () => {
    if (showDemo) return;
    reopenPanel();
    apiCache.deletePattern(/\/api\/locations/);
    await rescanChats();
    setLoading(true);
    try {
      const res = await locationSuggestionsApi.list();
      setSuggestions(res.suggestions ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [showDemo, rescanChats, reopenPanel]);

  const handleAdd = async (s: LocationSuggestion) => {
    const k = keyFor(s);
    if (isSimilarSuggestion(s)) {
      const targetId = suggestionMatchedId(s);
      setDismissed(prev => new Set(prev).add(k));
      if (targetId) {
        window.dispatchEvent(
          new CustomEvent('lk:suggest-merge:locations', { detail: { targetId, suggestionName: s.name } })
        );
      }
      setError(
        suggestionMatchedName(s)
          ? `Use the merge panel below to combine “${s.name}” with ${suggestionMatchedName(s)}.`
          : 'Use the merge panel below to combine possible duplicate places.'
      );
      return;
    }
    setAdding(k);
    setError(null);
    try {
      if (showDemo) {
        mockDataService.mutate.locations.create({
          name: s.name,
          type: s.type,
          context: s.context,
        });
        mockDataService.mutate.locations.removeSuggestion({ id: s.id, name: s.name });
      } else {
        const result = await locationSuggestionsApi.accept(s);
        if (!result?.success || !result.location?.id) {
          throw new Error('Server did not create the place');
        }
        apiCache.deletePattern(/\/api\/locations/);
      }
      setAdded(prev => new Set(prev).add(k));
      setSuggestions(prev => prev.filter(item => keyFor(item) !== k));
      onLocationAdded?.();
      window.dispatchEvent(new CustomEvent('lk:locations-updated', { detail: {} }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add place');
    } finally {
      setAdding(null);
    }
  };

  const handleDismiss = async (s: LocationSuggestion) => {
    const k = keyFor(s);
    setDismissed(prev => new Set(prev).add(k));
    setSuggestions(prev => prev.filter(item => keyFor(item) !== k));
    if (showDemo) {
      mockDataService.mutate.locations.removeSuggestion({ id: s.id, name: s.name });
      return;
    }
    try {
      await suggestionDismissApi.dismiss({
        bookDomain: 'locations',
        name: s.name,
        suggestionId: s.id,
      });
    } catch {
      /* non-blocking */
    }
  };

  const handleCopyAll = async () => {
    const ok = await copyTextToClipboard(buildLocationSuggestionsClipboardText(visible));
    if (!ok) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  if (hidePanel) {
    return RescanToastContainer ? <RescanToastContainer /> : null;
  }

  return (
    <>
    <div className="rounded-lg border border-teal-500/30 bg-gradient-to-br from-teal-950/25 via-black/40 to-black/40 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-teal-400 flex-shrink-0" />
          <h3 className="text-sm sm:text-base font-semibold text-white truncate">
            Places detected in your chats
          </h3>
          {!loading && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/20 text-teal-200 font-mono">
              {visible.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => void handleRescan()}
            disabled={loading || rescanning}
            className="h-8 w-8 flex items-center justify-center rounded text-white/50 hover:text-teal-300 hover:bg-teal-500/10"
            title="Rescan my chats for places"
          >
            <RefreshCw className={`h-4 w-4 ${loading || rescanning ? 'animate-spin' : ''}`} />
          </button>
          {visible.length > 0 && (
            <button
              type="button"
              onClick={() => void handleCopyAll()}
              className={cn(
                'h-8 w-8 flex items-center justify-center rounded transition-colors',
                copied ? 'text-emerald-300' : 'text-white/50 hover:text-teal-300 hover:bg-teal-500/10',
              )}
              title="Copy all suggested places as plain text"
              aria-label="Copy all suggested places"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          )}
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
          ) : visible.length === 0 ? (
            <SuggestionPanelEmptyState
              message="No pending place suggestions. Rescan your chats to find locations mentioned in your story."
              onDismiss={dismissEmptyPanel}
              onRescan={showDemo ? undefined : () => void handleRescan()}
              rescanning={rescanning}
              rescanLabel="Rescan for places"
            />
          ) : (
            visible.map(s => {
              const k = keyFor(s);
              return (
                <div
                  key={k}
                  className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5"
                >
                  <MapPin className="h-4 w-4 text-teal-300/80 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{s.name}</p>
                    {s.context && (
                      <p className="text-[11px] text-white/45 line-clamp-2 mt-0.5">{s.context}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-200/80 border border-teal-500/20">
                        {SOURCE_LABEL[s.source]}
                      </span>
                      <SuggestionMergeHint item={s} bookLabel="Places book" />
                      {s.type && (
                        <span className="text-[9px] text-white/35 capitalize">{s.type.replace(/_/g, ' ')}</span>
                      )}
                      {s.status === 'needs_review' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200/80 border border-amber-500/20">
                          Review
                        </span>
                      )}
                      {s.privacySensitive && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-200/80 border border-purple-500/20">
                          Private
                        </span>
                      )}
                    </div>
                    <SuggestionCategoryRedirect
                      name={s.name}
                      fromDomain="locations"
                      suggestionId={s.id}
                      alternatives={s.alternative_categories}
                      context={s.context}
                      evidence={s.description}
                      disabled={adding === k}
                      onReclassified={() => void handleDismiss(s)}
                      className="mt-1.5"
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleAdd(s)}
                      disabled={adding === k}
                      className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded bg-teal-500/20 text-teal-100 hover:bg-teal-500/30 border border-teal-500/30 disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3 shrink-0" />
                      <span className="truncate max-w-[5.5rem] sm:max-w-[12rem]">
                        {suggestionPrimaryActionLabel({ item: s, addLabel: 'Add' })}
                      </span>
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
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
    {RescanToastContainer ? <RescanToastContainer /> : null}
    </>
  );
};
