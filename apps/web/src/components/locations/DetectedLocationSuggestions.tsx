import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Plus, X, ChevronDown, ChevronUp, RefreshCw, MapPin } from 'lucide-react';
import { locationSuggestionsApi, type LocationSuggestion } from '../../api/entitySuggestions';
import { apiCache } from '../../lib/cache';
import { isNameAlreadyInBookList } from '../../lib/suggestionBookFilter';
import { useShouldUseMockData } from '../../hooks/useShouldUseMockData';

type Props = {
  onLocationAdded?: () => void;
  demoMode?: boolean;
  /** Names already in the Places book — hide matching suggestions. */
  existingLocationNames?: string[];
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

export const DetectedLocationSuggestions = ({ onLocationAdded, demoMode, existingLocationNames = [] }: Props) => {
  const isMock = useShouldUseMockData();
  const showDemo = demoMode ?? isMock;
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (showDemo) {
      setSuggestions(DEMO_SUGGESTIONS);
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
    const interval = setInterval(() => { void fetchSuggestions(); }, 5 * 60 * 1000);
    const onRefresh = () => { void fetchSuggestions(); };
    window.addEventListener('lk:locations-updated', onRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('lk:locations-updated', onRefresh);
    };
  }, [fetchSuggestions]);

  const visible = useMemo(
    () =>
      suggestions
        .filter(s => s.name?.trim())
        .filter(s => !dismissed.has(keyFor(s)) && !added.has(keyFor(s)))
        .filter(s => !existingLocationNames.length || !isNameAlreadyInBookList(s.name, existingLocationNames))
        .sort((a, b) => (b.confidence - a.confidence) || (b.mentionCount - a.mentionCount))
        .slice(0, 12),
    [suggestions, dismissed, added, existingLocationNames]
  );

  if (!loading && visible.length === 0) return null;

  const handleAdd = async (s: LocationSuggestion) => {
    const k = keyFor(s);
    setAdding(k);
    setError(null);
    try {
      if (!showDemo) {
        const result = await locationSuggestionsApi.accept(s);
        if (!result?.success || !result.location?.id) {
          throw new Error('Server did not create the place');
        }
        apiCache.deletePattern(/\/api\/locations/);
      }
      setAdded(prev => new Set(prev).add(k));
      onLocationAdded?.();
      window.dispatchEvent(new CustomEvent('lk:locations-updated', { detail: {} }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add place');
    } finally {
      setAdding(null);
    }
  };

  return (
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
            onClick={() => void fetchSuggestions()}
            disabled={loading}
            className="h-8 w-8 flex items-center justify-center rounded text-white/50 hover:text-teal-300 hover:bg-teal-500/10"
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
                      {s.type && (
                        <span className="text-[9px] text-white/35 capitalize">{s.type.replace(/_/g, ' ')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleAdd(s)}
                      disabled={adding === k}
                      className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded bg-teal-500/20 text-teal-100 hover:bg-teal-500/30 border border-teal-500/30 disabled:opacity-50"
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
