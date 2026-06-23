import { useState, useMemo, useEffect } from 'react';
import { MapPin, RefreshCw, ChevronLeft, ChevronRight, SlidersHorizontal, X, BookOpen } from 'lucide-react';
import { classifyLocation, KIND_META, isTopLevelPlace, type LocationKind } from '../../lib/locationTaxonomy';
import {
  PLACE_ADVANCED_FILTER_GROUPS,
  PLACE_LIFESTYLE_FILTERS,
  PLACE_TAXONOMY,
  placeMatchesAdvancedFilter,
  placeMatchesFilter,
  placeMatchesLifestyleFilter,
  getSubTypeFiltersForCategory,
  type PlaceAdvancedFilter,
  type PlaceCategory,
  type PlaceLifestyleFilter,
} from '../../lib/placeTypes';
import { LocationProfileCard, type LocationProfile } from './LocationProfileCard';
import { LocationDetailModal } from './LocationDetailModal';
import { Button } from '../ui/button';
import { SearchWithAutocomplete } from '../ui/SearchWithAutocomplete';
import { fetchJson } from '../../lib/api';
import { fetchLocationById } from '../../lib/hydrateBookEntity';
import { consumeHighlightItemId, resolveBookHighlightItem } from '../../lib/resolveBookHighlight';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { mockDataService } from '../../services/mockDataService';
import { BookTrustSummary } from '../trust/BookTrustSummary';
import { ChatFirstViewHint } from '../ChatFirstViewHint';
import { DetectedLocationSuggestions } from './DetectedLocationSuggestions';
import { LocationMergePanel } from './LocationMergePanel';
import { OntologyCompliancePanel } from '../ontology/OntologyCompliancePanel';
import { useLocationsBookData } from '../../store/hooks/useEntityBooks';
import { locationBookDemoLocations } from '../../mocks/locationBookDemo';

// Export for use in mock data service + tests
export const dummyLocations = locationBookDemoLocations;

const ITEMS_PER_PAGE = 12; // 2 columns × 6 rows on mobile

export const LocationBook = () => {
  const { data, loading, refetch, isMockEnabled: isMockDataEnabled } = useLocationsBookData();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Seed demo locations once; preserve in-session edits.
  useEffect(() => {
    if (mockDataService.get.locations().length === 0) {
      mockDataService.register.locations(dummyLocations);
    }
  }, []);
  const [mockRegistryTick, setMockRegistryTick] = useState(0);
  useEffect(() => {
    if (!isMockDataEnabled) return;
    return mockDataService.subscribe(() => setMockRegistryTick((tick) => tick + 1));
  }, [isMockDataEnabled]);
  const [selectedLocation, setSelectedLocation] = useState<LocationProfile | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [allMemories, setAllMemories] = useState<MemoryCard[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLifestyle, setSelectedLifestyle] = useState<PlaceLifestyleFilter>('all');
  const [selectedAdvancedFilter, setSelectedAdvancedFilter] = useState<PlaceAdvancedFilter | null>(null);
  const [selectedKind, setSelectedKind] = useState<LocationKind | null>(null);
  const [selectedSubType, setSelectedSubType] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ targetId?: string }>).detail;
      if (!detail?.targetId) return;
      setSelectionMode(true);
      setSelectedForMerge(new Set([detail.targetId]));
    };
    window.addEventListener('lk:suggest-merge:locations', handler);
    return () => window.removeEventListener('lk:suggest-merge:locations', handler);
  }, []);

  const { entries = [] } = useLoreKeeper();

  const locations = useMemo(() => {
    if (isMockDataEnabled) {
      const registered = mockDataService.get.locations();
      return registered.length > 0 ? registered : dummyLocations;
    }
    const locationList = (data?.locations ?? []) as LocationProfile[];
    return mockDataService.getWithFallback.locations(
      locationList.length > 0 ? locationList : null,
      false
    ).data;
  }, [data, isMockDataEnabled, mockRegistryTick]);

  useEffect(() => {
    setSelectedLocation((sel) => {
      if (!sel) return null;
      const updated = locations.find((l) => l.id === sel.id);
      return updated ?? sel;
    });
  }, [locations]);

  const toggleSelectedForMerge = (locationId: string) => {
    setSelectedForMerge(prev => {
      const next = new Set(prev);
      if (next.has(locationId)) next.delete(locationId);
      else next.add(locationId);
      return next;
    });
  };

  useEffect(() => {
    const memoryCards = entries.map(entry => memoryEntryToCard({
      id: entry.id,
      date: entry.date,
      content: entry.content,
      summary: entry.summary || null,
      tags: entry.tags || [],
      mood: entry.mood || null,
      chapter_id: entry.chapter_id || null,
      source: entry.source || 'manual',
      metadata: entry.metadata || {}
    }));
    setAllMemories(memoryCards);
  }, [entries]);

  useEffect(() => {
    setSelectedSubType(null);
  }, [selectedAdvancedFilter]);

  const filteredLocations = useMemo(() => {
    let locs = locations.filter(isTopLevelPlace);

    locs = locs.filter(loc => placeMatchesLifestyleFilter(loc, selectedLifestyle));

    if (selectedAdvancedFilter) {
      if (selectedSubType) {
        locs = locs.filter(loc => placeMatchesFilter(loc, 'all', selectedSubType));
      } else {
        locs = locs.filter(loc => placeMatchesAdvancedFilter(loc, selectedAdvancedFilter));
      }
    }

    if (selectedKind) {
      locs = locs.filter(loc => classifyLocation(loc) === selectedKind);
    }

    if (!searchTerm.trim()) return locs;
    const term = searchTerm.toLowerCase();
    return locs.filter(
      (loc) =>
        loc.name.toLowerCase().includes(term) ||
        (loc.type ?? '').toLowerCase().includes(term) ||
        loc.relatedPeople.some((person) => person.name.toLowerCase().includes(term)) ||
        loc.tagCounts.some((tag) => tag.tag.toLowerCase().includes(term)) ||
        loc.chapters.some((chapter) => chapter.title?.toLowerCase().includes(term))
    );
  }, [locations, searchTerm, selectedLifestyle, selectedAdvancedFilter, selectedSubType, selectedKind]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedLifestyle, selectedAdvancedFilter, selectedSubType, selectedKind]);

  const totalPages = Math.ceil(filteredLocations.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedLocations = filteredLocations.slice(startIndex, endIndex);
  const visibleStart = filteredLocations.length === 0 ? 0 : startIndex + 1;
  const visibleEnd = Math.min(endIndex, filteredLocations.length);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const goToPrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Auto-open modal when navigated here from an entity chip (chat → locations).
  useEffect(() => {
    if (loading) return;
    const id = consumeHighlightItemId();
    if (!id) return;

    let cancelled = false;
    (async () => {
      const resolved = await resolveBookHighlightItem({
        id,
        items: locations,
        fetchById: fetchLocationById,
      });
      if (!cancelled && resolved) setSelectedLocation(resolved);
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, locations]);

  // Arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages]);

  const subTypeFilters = useMemo(() => {
    if (!selectedAdvancedFilter || !(selectedAdvancedFilter in PLACE_TAXONOMY)) {
      return [];
    }
    return getSubTypeFiltersForCategory(locations, selectedAdvancedFilter as PlaceCategory);
  }, [selectedAdvancedFilter, locations]);

  const topLevelLocations = useMemo(
    () => locations.filter(isTopLevelPlace),
    [locations]
  );

  const lifestyleFilters = useMemo(() => {
    return PLACE_LIFESTYLE_FILTERS.map(filter => ({
      ...filter,
      count: topLevelLocations.filter(loc => placeMatchesLifestyleFilter(loc, filter.id)).length,
    }));
  }, [topLevelLocations]);

  const advancedFilterGroups = useMemo(() => {
    return PLACE_ADVANCED_FILTER_GROUPS.map(group => ({
      ...group,
      filters: group.filters.map(filter => ({
        ...filter,
        count: topLevelLocations.filter(loc => placeMatchesAdvancedFilter(loc, filter.id)).length,
      })),
    }));
  }, [topLevelLocations]);

  const activeAdvancedLabel = useMemo(() => {
    if (!selectedAdvancedFilter) return null;
    for (const group of PLACE_ADVANCED_FILTER_GROUPS) {
      const match = group.filters.find(filter => filter.id === selectedAdvancedFilter);
      if (match) return match.label;
    }
    return null;
  }, [selectedAdvancedFilter]);

  const kindFilters = useMemo(() => {
    const counts = new Map<LocationKind, number>();
    for (const loc of topLevelLocations) {
      const k = classifyLocation(loc);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const order: LocationKind[] = ['country', 'state', 'region', 'city', 'neighborhood', 'residence', 'venue', 'landmark', 'nature', 'other'];
    return order
      .filter(k => (counts.get(k) ?? 0) > 0)
      .map(k => ({ kind: k, count: counts.get(k)!, meta: KIND_META[k] }));
  }, [topLevelLocations]);

  return (
    <div className={`space-y-5 ${selectionMode && selectedForMerge.size >= 2 ? 'pb-28 sm:pb-4' : ''}`}>
      <ChatFirstViewHint />

      <DetectedLocationSuggestions
        demoMode={isMockDataEnabled}
        existingBookEntries={locations.map(l => ({
          id: l.id,
          name: l.name,
          aliases: Array.isArray(l.metadata?.aliases) ? (l.metadata!.aliases as string[]) : [],
        }))}
        existingLocationNames={locations.flatMap(l => [
          l.name,
          ...(Array.isArray(l.metadata?.aliases) ? (l.metadata!.aliases as string[]) : []),
        ])}
        onLocationAdded={() => void refetch()}
      />

      <LocationMergePanel
        locations={locations}
        demoMode={isMockDataEnabled}
        onMerged={() => void refetch()}
        selectionMode={selectionMode}
        onSelectionModeChange={setSelectionMode}
        selectedForMerge={selectedForMerge}
        onToggleSelected={toggleSelectedForMerge}
        onClearSelection={() => setSelectedForMerge(new Set())}
      />

      <OntologyCompliancePanel book="locations" />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-white truncate">Places</h2>
          <p className="text-[11px] sm:text-xs text-white/40 mt-0.5">
            {filteredLocations.length} of {topLevelLocations.length} places
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-teal-400 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Search */}
      <SearchWithAutocomplete<LocationProfile>
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Search by name, people, or tags…"
        items={locations}
        getSearchableText={loc =>
          [loc.name, ...loc.relatedPeople.map(p => p.name), ...loc.tagCounts.map(t => t.tag)].join(' ')
        }
        getDisplayLabel={loc => loc.name}
        maxSuggestions={8}
        className="w-full"
        inputClassName="bg-black/40 border-white/10 text-white placeholder:text-white/30 text-sm"
        emptyHint="No matching locations"
      />

      {/* Lifestyle filters — horizontal scroll on mobile */}
      <div className="-mx-1 px-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex flex-nowrap sm:flex-wrap items-center justify-start gap-2 min-w-min sm:min-w-0 pb-0.5">
        {lifestyleFilters.map(({ id, label, icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSelectedLifestyle(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              selectedLifestyle === id
                ? 'bg-teal-500/15 border-teal-500/40 text-teal-300'
                : 'bg-white/4 border-white/10 text-white/50 hover:border-white/25 hover:text-white/70'
            }`}
          >
            <span aria-hidden>{icon}</span>
            {label}
            {id !== 'all' && <span className="text-[10px] text-white/40">{count}</span>}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setAdvancedOpen(open => !open)}
          className={`ml-0 sm:ml-1 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            advancedOpen || selectedAdvancedFilter
              ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
              : 'bg-white/4 border-white/10 text-white/50 hover:border-white/25 hover:text-white/70'
          }`}
          aria-expanded={advancedOpen}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Advanced
          {activeAdvancedLabel && <span className="text-[10px] text-white/45">· {activeAdvancedLabel}</span>}
        </button>

        {(selectedAdvancedFilter || selectedKind) && (
          <button
            type="button"
            onClick={() => {
              setSelectedAdvancedFilter(null);
              setSelectedSubType(null);
              setSelectedKind(null);
            }}
            className="flex items-center gap-1 text-xs text-white/35 hover:text-white/65 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}
        </div>
      </div>

      {advancedOpen && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45 mb-2">
              Advanced Filters
            </p>
            <p className="text-xs text-white/35">
              Narrow places by type or by what they mean in your story.
            </p>
          </div>

          {advancedFilterGroups.map(group => (
            <div key={group.label} className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/35">
                {group.label}
              </p>
              <div className="flex flex-wrap justify-center sm:justify-start gap-1.5">
                {group.filters.map(({ id, label, icon, count }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setSelectedAdvancedFilter(id);
                      setSelectedSubType(null);
                    }}
                    className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                      selectedAdvancedFilter === id
                        ? 'bg-purple-500/15 border-purple-500/35 text-purple-200'
                        : 'border-white/10 text-white/45 hover:text-white/70 hover:border-white/25'
                    }`}
                  >
                    {icon && <span className="mr-1" aria-hidden>{icon}</span>}
                    {label}
                    <span className="ml-1 text-white/35">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sub-type filters within selected category (e.g. Nightclub, Goth Club) */}
      {subTypeFilters.length > 1 && (
        <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 -mt-1">
          <button
            type="button"
            onClick={() => setSelectedSubType(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
              !selectedSubType
                ? 'bg-teal-500/15 border-teal-500/35 text-teal-300'
                : 'border-white/10 text-white/45 hover:text-white/65'
            }`}
          >
            All in category
          </button>
          {subTypeFilters.map(({ type, label, count }) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedSubType(type)}
              className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                selectedSubType === type
                  ? 'bg-teal-500/15 border-teal-500/35 text-teal-300'
                  : 'border-white/10 text-white/45 hover:text-white/65'
              }`}
            >
              {label}
              <span className="ml-1 text-white/35">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Geographic kind filters — country / city / venue … */}
      {kindFilters.length > 1 && (
        <div className="flex flex-wrap justify-center sm:justify-start gap-2 -mt-2">
          {kindFilters.map(({ kind, count, meta }) => {
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setSelectedKind(current => current === kind ? null : kind)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  selectedKind === kind
                    ? 'bg-teal-500/15 border-teal-500/40 text-teal-300'
                    : 'bg-white/4 border-white/10 text-white/50 hover:border-white/25 hover:text-white/70'
                }`}
              >
                <span aria-hidden>{meta.icon}</span>
                {meta.plural}
                <span className="text-[10px] text-white/40">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Places Display */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
          {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
            <div key={i} className="min-h-[10.5rem] sm:min-h-[12.5rem] rounded-xl bg-white/5 border border-white/8 animate-pulse" />
          ))}
        </div>
      ) : filteredLocations.length === 0 ? (
        <div className="text-center py-16">
          <MapPin className="h-10 w-10 mx-auto mb-3 text-white/15" />
          <p className="text-sm font-medium text-white/50 mb-1">No places found</p>
          <p className="text-xs text-white/30">Mention places in chat and LoreBook will track them</p>
        </div>
      ) : (
        <>
          {/* Book Page Container */}
          <div className="relative w-full sm:min-h-[640px] lg:min-h-[720px] bg-gradient-to-br from-teal-950/20 via-black/40 to-teal-950/20 rounded-lg border border-teal-800/30 sm:border-2 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-3 sm:p-8 flex flex-col flex-1 min-h-0">
              {/* Page Header */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3 sm:mb-6 pb-3 sm:pb-4 border-b border-teal-800/20">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-teal-500/60 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-semibold text-teal-200/50 uppercase tracking-wider">
                      Places Book
                    </h3>
                    <p className="text-[11px] sm:text-xs text-teal-300/40 mt-0.5 truncate">
                      Page {currentPage} of {totalPages} · {filteredLocations.length} places
                    </p>
                    <BookTrustSummary domain="locations" className="mt-1" />
                  </div>
                </div>
                <div className="text-[10px] sm:text-xs text-teal-300/35 font-mono shrink-0 hidden sm:block">
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>

              {/* Places Grid */}
              <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 mb-3 sm:mb-6 content-start min-h-0">
                {paginatedLocations.map((location, index) => (
                  <LocationProfileCard
                    key={location.id || `loc-${index}`}
                    location={location}
                    allLocations={locations}
                    selectionMode={selectionMode}
                    selected={selectedForMerge.has(location.id)}
                    onClick={() =>
                      selectionMode ? toggleSelectedForMerge(location.id) : setSelectedLocation(location)
                    }
                  />
                ))}
              </div>

              {/* Page Footer with Navigation */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 pt-4 border-t border-teal-800/20 mt-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPrevious}
                  disabled={currentPage === 1}
                  className="text-teal-300/60 hover:text-teal-200 hover:bg-teal-500/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-black/40 rounded-lg border border-teal-800/30">
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 7) pageNum = i + 1;
                        else if (currentPage <= 4) pageNum = i + 1;
                        else if (currentPage >= totalPages - 3) pageNum = totalPages - 6 + i;
                        else pageNum = currentPage - 3 + i;

                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => goToPage(pageNum)}
                            className={`px-2 py-1 rounded text-sm transition ${
                              currentPage === pageNum
                                ? 'bg-teal-600 text-white'
                                : 'text-teal-300/60 hover:text-teal-200 hover:bg-teal-500/10'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <span className="text-sm text-teal-300/50">
                    {visibleStart}-{visibleEnd} of {filteredLocations.length}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNext}
                  disabled={currentPage === totalPages}
                  className="text-teal-300/60 hover:text-teal-200 hover:bg-teal-500/10 disabled:opacity-30"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* Book Binding Effect */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-teal-900/40 via-teal-800/30 to-teal-900/40" />
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-teal-900/40 via-teal-800/30 to-teal-900/40" />
          </div>
        </>
      )}

      {selectedLocation && (
        <LocationDetailModal
          location={selectedLocation}
          allLocations={locations}
          onSelectLocation={(loc) => setSelectedLocation(loc)}
          onLocationUpdated={(loc) => {
            setSelectedLocation(loc);
            void refetch();
          }}
          onLocationDeleted={() => {
            setSelectedLocation(null);
            void refetch();
          }}
          onClose={() => { setSelectedLocation(null); void refetch(); }}
        />
      )}

      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
          onNavigate={memoryId => {
            const m = allMemories.find(x => x.id === memoryId);
            if (m) setSelectedMemory(m);
          }}
          allMemories={allMemories}
        />
      )}
    </div>
  );
};
