import { useState, useMemo, useEffect } from 'react';
import { MapPin, RefreshCw, ChevronLeft, ChevronRight, Home, Briefcase, Plane, Coffee, Leaf } from 'lucide-react';
import { LocationProfileCard, type LocationProfile } from './LocationProfileCard';
import { LocationDetailModal } from './LocationDetailModal';
import { Button } from '../ui/button';
import { SearchWithAutocomplete } from '../ui/SearchWithAutocomplete';
import { fetchJson } from '../../lib/api';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { mockDataService } from '../../services/mockDataService';
import { useMockData } from '../../contexts/MockDataContext';
import { ChatFirstViewHint } from '../ChatFirstViewHint';

// Comprehensive mock location data showcasing all app capabilities
// Export for use in mock data service
export const dummyLocations: LocationProfile[] = [
  {
    id: 'dummy-loc-1',
    name: 'San Francisco Tech Hub',
    visitCount: 12,
    firstVisited: '2022-03-15T10:00:00Z',
    lastVisited: '2024-03-20T14:30:00Z',
    coordinates: { lat: 37.7749, lng: -122.4194 },
    relatedPeople: [
      { id: 'person-1', name: 'Sarah Chen', total_mentions: 45, entryCount: 8 },
      { id: 'person-2', name: 'Marcus Johnson', total_mentions: 30, entryCount: 5 }
    ],
    tagCounts: [
      { tag: 'work', count: 8 },
      { tag: 'meeting', count: 5 },
      { tag: 'networking', count: 3 },
      { tag: 'career-transition', count: 4 }
    ],
    chapters: [
      { id: 'ch-1', title: 'Tech Adventures', count: 6 },
      { id: 'ch-2', title: 'Career Growth', count: 4 },
      { id: 'ch-creative', title: 'Creative Renaissance', count: 2 }
    ],
    moods: [
      { mood: 'excited', count: 5 },
      { mood: 'focused', count: 4 },
      { mood: 'nostalgic', count: 3 }
    ],
    entries: [],
    sources: ['journal', 'calendar']
  },
  {
    id: 'dummy-loc-2',
    name: 'Golden Gate Park',
    visitCount: 25,
    firstVisited: '2023-08-01T09:00:00Z',
    lastVisited: '2024-03-15T16:00:00Z',
    coordinates: { lat: 37.7694, lng: -122.4862 },
    relatedPeople: [
      { id: 'person-1', name: 'Alex', total_mentions: 35, entryCount: 12 },
      { id: 'person-2', name: 'Jordan Kim', total_mentions: 20, entryCount: 8 },
      { id: 'person-3', name: 'Sarah Chen', total_mentions: 15, entryCount: 5 },
      { id: 'person-4', name: 'David Martinez', total_mentions: 8, entryCount: 3 }
    ],
    tagCounts: [
      { tag: 'nature', count: 12 },
      { tag: 'relaxation', count: 10 },
      { tag: 'exercise', count: 8 },
      { tag: 'dates', count: 6 },
      { tag: 'photography', count: 5 }
    ],
    chapters: [
      { id: 'ch-3', title: 'Weekend Escapes', count: 8 },
      { id: 'ch-relationship', title: 'Relationship Journey', count: 6 },
      { id: 'ch-creative', title: 'Creative Renaissance', count: 4 }
    ],
    moods: [
      { mood: 'peaceful', count: 12 },
      { mood: 'energized', count: 8 },
      { mood: 'happy', count: 5 }
    ],
    entries: [],
    sources: ['journal', 'photo']
  },
  {
    id: 'dummy-loc-3',
    name: 'Home Studio',
    visitCount: 120,
    firstVisited: '2023-06-01T08:00:00Z',
    lastVisited: '2024-03-25T18:00:00Z',
    coordinates: null,
    relatedPeople: [
      { id: 'person-1', name: 'Alex Rivera', total_mentions: 85, entryCount: 35 },
      { id: 'person-2', name: 'Alex', total_mentions: 25, entryCount: 12 },
      { id: 'person-3', name: 'Marcus Johnson', total_mentions: 15, entryCount: 8 }
    ],
    tagCounts: [
      { tag: 'music-production', count: 60 },
      { tag: 'creative-work', count: 45 },
      { tag: 'collaboration', count: 35 },
      { tag: 'writing', count: 20 },
      { tag: 'focus', count: 40 }
    ],
    chapters: [
      { id: 'ch-creative', title: 'Creative Renaissance', count: 50 },
      { id: 'ch-music', title: 'Music Production Saga', count: 35 },
      { id: 'ch-writing', title: 'Writing Journey', count: 20 }
    ],
    moods: [
      { mood: 'focused', count: 45 },
      { mood: 'creative', count: 40 },
      { mood: 'accomplished', count: 25 },
      { mood: 'frustrated', count: 10 }
    ],
    entries: [],
    sources: ['journal', 'task']
  },
  {
    id: 'dummy-loc-4',
    name: 'Coffee Shop Downtown',
    visitCount: 45,
    firstVisited: '2023-09-10T08:00:00Z',
    lastVisited: '2024-03-22T15:00:00Z',
    coordinates: { lat: 37.7849, lng: -122.4094 },
    relatedPeople: [
      { id: 'person-1', name: 'Alex', total_mentions: 60, entryCount: 20 },
      { id: 'person-2', name: 'Sarah Chen', total_mentions: 35, entryCount: 15 },
      { id: 'person-3', name: 'Emma Thompson', total_mentions: 20, entryCount: 8 },
      { id: 'person-4', name: 'Sophia Anderson', total_mentions: 15, entryCount: 6 }
    ],
    tagCounts: [
      { tag: 'coffee', count: 30 },
      { tag: 'writing', count: 25 },
      { tag: 'work', count: 20 },
      { tag: 'social', count: 15 },
      { tag: 'dates', count: 8 }
    ],
    chapters: [
      { id: 'ch-4', title: 'Daily Routines', count: 18 },
      { id: 'ch-relationship', title: 'Relationship Journey', count: 12 },
      { id: 'ch-creative', title: 'Creative Renaissance', count: 15 }
    ],
    moods: [
      { mood: 'calm', count: 20 },
      { mood: 'creative', count: 18 },
      { mood: 'happy', count: 7 }
    ],
    entries: [],
    sources: ['journal', 'calendar']
  },
  {
    id: 'dummy-loc-5',
    name: 'Tokyo, Japan',
    visitCount: 1,
    firstVisited: '2024-02-15T00:00:00Z',
    lastVisited: '2024-02-25T23:59:59Z',
    coordinates: { lat: 35.6762, lng: 139.6503 },
    relatedPeople: [],
    tagCounts: [
      { tag: 'travel', count: 10 },
      { tag: 'adventure', count: 8 },
      { tag: 'culture', count: 6 }
    ],
    chapters: [
      { id: 'ch-5', title: 'International Adventures', count: 10 }
    ],
    moods: [
      { mood: 'excited', count: 8 },
      { mood: 'curious', count: 5 }
    ],
    entries: [],
    sources: ['journal', 'photo']
  },
  {
    id: 'dummy-loc-6',
    name: 'Gym & Fitness Center',
    visitCount: 35,
    firstVisited: '2024-01-05T06:00:00Z',
    lastVisited: '2024-03-24T19:00:00Z',
    coordinates: { lat: 37.7649, lng: -122.4294 },
    relatedPeople: [
      { id: 'person-4', name: 'David Martinez', total_mentions: 10, entryCount: 3 }
    ],
    tagCounts: [
      { tag: 'fitness', count: 25 },
      { tag: 'health', count: 20 },
      { tag: 'routine', count: 15 }
    ],
    chapters: [
      { id: 'ch-6', title: 'Health & Wellness', count: 20 }
    ],
    moods: [
      { mood: 'energized', count: 20 },
      { mood: 'accomplished', count: 12 }
    ],
    entries: [],
    sources: ['journal', 'calendar']
  },
  {
    id: 'dummy-loc-7',
    name: 'Local Library',
    visitCount: 18,
    firstVisited: '2023-11-20T10:00:00Z',
    lastVisited: '2024-03-18T16:00:00Z',
    coordinates: { lat: 37.7549, lng: -122.4394 },
    relatedPeople: [
      { id: 'person-1', name: 'Sophia Anderson', total_mentions: 12, entryCount: 5 },
      { id: 'person-2', name: 'Emma Thompson', total_mentions: 8, entryCount: 3 }
    ],
    tagCounts: [
      { tag: 'study', count: 12 },
      { tag: 'quiet', count: 10 },
      { tag: 'learning', count: 8 },
      { tag: 'writing', count: 6 }
    ],
    chapters: [
      { id: 'ch-7', title: 'Learning Journey', count: 12 },
      { id: 'ch-creative', title: 'Creative Renaissance', count: 6 }
    ],
    moods: [
      { mood: 'focused', count: 12 },
      { mood: 'calm', count: 8 }
    ],
    entries: [],
    sources: ['journal', 'calendar']
  },
  {
    id: 'dummy-loc-8',
    name: 'Beach House',
    visitCount: 5,
    firstVisited: '2024-02-10T12:00:00Z',
    lastVisited: '2024-03-10T18:00:00Z',
    coordinates: { lat: 37.8049, lng: -122.4694 },
    relatedPeople: [
      { id: 'person-1', name: 'Sarah Chen', total_mentions: 45, entryCount: 3 },
      { id: 'person-6', name: 'Jordan Kim', total_mentions: 20, entryCount: 2 }
    ],
    tagCounts: [
      { tag: 'vacation', count: 4 },
      { tag: 'relaxation', count: 4 },
      { tag: 'family', count: 3 }
    ],
    chapters: [
      { id: 'ch-8', title: 'Weekend Getaways', count: 4 }
    ],
    moods: [
      { mood: 'peaceful', count: 4 },
      { mood: 'happy', count: 3 }
    ],
    entries: [],
    sources: ['journal', 'photo']
  },
  {
    id: 'dummy-loc-9',
    name: 'University Campus',
    visitCount: 28,
    firstVisited: '2024-01-08T08:00:00Z',
    lastVisited: '2024-03-20T17:00:00Z',
    coordinates: { lat: 37.7949, lng: -122.4194 },
    relatedPeople: [
      { id: 'person-7', name: 'Dr. Amara Wells', total_mentions: 12, entryCount: 4 }
    ],
    tagCounts: [
      { tag: 'education', count: 18 },
      { tag: 'networking', count: 10 },
      { tag: 'learning', count: 8 }
    ],
    chapters: [
      { id: 'ch-9', title: 'Academic Pursuits', count: 15 }
    ],
    moods: [
      { mood: 'curious', count: 15 },
      { mood: 'inspired', count: 10 }
    ],
    entries: [],
    sources: ['journal', 'calendar']
  },
  {
    id: 'dummy-loc-10',
    name: 'Art Gallery - Mission District',
    visitCount: 8,
    firstVisited: '2024-02-20T18:00:00Z',
    lastVisited: '2024-03-18T19:00:00Z',
    coordinates: { lat: 37.7599, lng: -122.4148 },
    relatedPeople: [
      { id: 'person-1', name: 'Jordan', total_mentions: 25, entryCount: 6 },
      { id: 'person-2', name: 'Sarah Chen', total_mentions: 8, entryCount: 2 }
    ],
    tagCounts: [
      { tag: 'art', count: 8 },
      { tag: 'networking', count: 6 },
      { tag: 'social', count: 5 },
      { tag: 'creative', count: 4 }
    ],
    chapters: [
      { id: 'ch-relationship', title: 'Relationship Journey', count: 4 },
      { id: 'ch-creative', title: 'Creative Renaissance', count: 4 }
    ],
    moods: [
      { mood: 'inspired', count: 5 },
      { mood: 'excited', count: 3 }
    ],
    entries: [],
    sources: ['journal', 'calendar']
  },
  {
    id: 'dummy-loc-11',
    name: 'Mountain Trail',
    visitCount: 12,
    firstVisited: '2024-01-12T07:00:00Z',
    lastVisited: '2024-03-16T10:00:00Z',
    coordinates: { lat: 37.8449, lng: -122.4894 },
    relatedPeople: [
      { id: 'person-9', name: 'Ethan Walker', total_mentions: 8, entryCount: 3 }
    ],
    tagCounts: [
      { tag: 'hiking', count: 10 },
      { tag: 'nature', count: 8 },
      { tag: 'exercise', count: 6 }
    ],
    chapters: [
      { id: 'ch-11', title: 'Outdoor Adventures', count: 8 }
    ],
    moods: [
      { mood: 'energized', count: 8 },
      { mood: 'peaceful', count: 6 }
    ],
    entries: [],
    sources: ['journal', 'photo']
  },
  {
    id: 'dummy-loc-12',
    name: 'Conference Center',
    visitCount: 3,
    firstVisited: '2024-02-20T09:00:00Z',
    lastVisited: '2024-03-05T17:00:00Z',
    coordinates: { lat: 37.7849, lng: -122.3994 },
    relatedPeople: [
      { id: 'person-2', name: 'Marcus', total_mentions: 30, entryCount: 2 },
      { id: 'person-3', name: 'Alex Rivera', total_mentions: 15, entryCount: 1 }
    ],
    tagCounts: [
      { tag: 'conference', count: 3 },
      { tag: 'networking', count: 3 },
      { tag: 'professional', count: 2 }
    ],
    chapters: [
      { id: 'ch-12', title: 'Professional Development', count: 3 }
    ],
    moods: [
      { mood: 'excited', count: 2 },
      { mood: 'focused', count: 2 }
    ],
    entries: [],
    sources: ['journal', 'calendar']
  }
];

const ITEMS_PER_PAGE = 18; // 3 columns × 6 rows on mobile, more on larger screens

export const LocationBook = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Register mock data with service on mount
  useEffect(() => {
    mockDataService.register.locations(dummyLocations);
  }, []);
  const [selectedLocation, setSelectedLocation] = useState<LocationProfile | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [allMemories, setAllMemories] = useState<MemoryCard[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTab, setSelectedTab] = useState('all');
  const { entries = [] } = useLoreKeeper();

  const loadLocations = async () => {
    setLoading(true);
    try {
      const response = await fetchJson<{ locations: LocationProfile[] }>('/api/locations');
      const locationList = response?.locations || [];
      
      // Use mock data service to determine what to show - pass current toggle state
      const result = mockDataService.getWithFallback.locations(
        locationList.length > 0 ? locationList : null,
        isMockDataEnabled
      );
      
      setLocations(result.data);
    } catch {
      // On error, use mock data if enabled
      const result = mockDataService.getWithFallback.locations(null, isMockDataEnabled);
      setLocations(result.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLocations();
  }, []);

  // Refresh when mock data toggle changes
  useEffect(() => {
    void loadLocations();
  }, [isMockDataEnabled]);

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

  const filteredLocations = useMemo(() => {
    let locs = locations;

    if (selectedTab === 'work') {
      locs = locs.filter(loc => 
        loc.tagCounts.some(t => t.tag === 'work') || 
        loc.name.toLowerCase().includes('office') ||
        loc.name.toLowerCase().includes('tech') ||
        loc.name.toLowerCase().includes('conference')
      );
    } else if (selectedTab === 'home') {
      locs = locs.filter(loc => 
        loc.name.toLowerCase().includes('home') ||
        loc.name.toLowerCase().includes('office') && loc.visitCount > 30
      );
    } else if (selectedTab === 'travel') {
      locs = locs.filter(loc => 
        loc.tagCounts.some(t => t.tag === 'travel') ||
        loc.tagCounts.some(t => t.tag === 'vacation') ||
        loc.coordinates && (loc.coordinates.lat < 37 || loc.coordinates.lat > 38)
      );
    } else if (selectedTab === 'social') {
      locs = locs.filter(loc => 
        loc.tagCounts.some(t => t.tag === 'coffee') ||
        loc.tagCounts.some(t => t.tag === 'social') ||
        loc.name.toLowerCase().includes('coffee') ||
        loc.name.toLowerCase().includes('gallery')
      );
    } else if (selectedTab === 'nature') {
      locs = locs.filter(loc => 
        loc.tagCounts.some(t => t.tag === 'nature') ||
        loc.tagCounts.some(t => t.tag === 'hiking') ||
        loc.name.toLowerCase().includes('park') ||
        loc.name.toLowerCase().includes('trail') ||
        loc.name.toLowerCase().includes('beach')
      );
    }

    if (!searchTerm.trim()) return locs;
    const term = searchTerm.toLowerCase();
    return locs.filter(
      (loc) =>
        loc.name.toLowerCase().includes(term) ||
        loc.relatedPeople.some((person) => person.name.toLowerCase().includes(term)) ||
        loc.tagCounts.some((tag) => tag.tag.toLowerCase().includes(term)) ||
        loc.chapters.some((chapter) => chapter.title?.toLowerCase().includes(term))
    );
  }, [locations, searchTerm, selectedTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTab]);

  const totalPages = Math.ceil(filteredLocations.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedLocations = filteredLocations.slice(startIndex, endIndex);

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
    if (loading || locations.length === 0) return;
    const id = sessionStorage.getItem('highlightItem');
    if (!id) return;
    sessionStorage.removeItem('highlightItem');
    const match = locations.find(l => l.id === id);
    if (match) setSelectedLocation(match);
  }, [loading, locations]);

  // Refresh when chat pipeline creates/updates locations.
  useEffect(() => {
    const handler = () => { void loadLocations(); };
    window.addEventListener('lk:locations-updated', handler);
    return () => window.removeEventListener('lk:locations-updated', handler);
  }, []);

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

  const FILTERS = [
    { value: 'all',    label: 'All',    icon: MapPin },
    { value: 'work',   label: 'Work',   icon: Briefcase },
    { value: 'home',   label: 'Home',   icon: Home },
    { value: 'travel', label: 'Travel', icon: Plane },
    { value: 'social', label: 'Social', icon: Coffee },
    { value: 'nature', label: 'Nature', icon: Leaf },
  ] as const;

  return (
    <div className="space-y-5">
      <ChatFirstViewHint />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Places</h2>
          <p className="text-xs text-white/40 mt-0.5">
            {filteredLocations.length} of {locations.length} locations
            {totalPages > 1 && ` · page ${currentPage}/${totalPages}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadLocations()}
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

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setSelectedTab(value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              selectedTab === value
                ? 'bg-teal-500/15 border-teal-500/40 text-teal-300'
                : 'bg-white/4 border-white/10 text-white/50 hover:border-white/25 hover:text-white/70'
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-white/5 border border-white/8 animate-pulse" />
          ))}
        </div>
      ) : filteredLocations.length === 0 ? (
        <div className="text-center py-16">
          <MapPin className="h-10 w-10 mx-auto mb-3 text-white/15" />
          <p className="text-sm font-medium text-white/50 mb-1">No locations found</p>
          <p className="text-xs text-white/30">Mention places in chat and LoreBook will track them</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {paginatedLocations.map((location, index) => (
            <LocationProfileCard
              key={location.id || `loc-${index}`}
              location={location}
              onClick={() => setSelectedLocation(location)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={goToPrevious}
            disabled={currentPage === 1}
            className="flex items-center gap-1 text-sm text-white/40 hover:text-teal-400 disabled:opacity-25 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p: number;
              if (totalPages <= 7)             p = i + 1;
              else if (currentPage <= 4)       p = i + 1;
              else if (currentPage >= totalPages - 3) p = totalPages - 6 + i;
              else                             p = currentPage - 3 + i;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => goToPage(p)}
                  className={`w-7 h-7 rounded-lg text-xs font-medium transition-all ${
                    currentPage === p
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                      : 'text-white/35 hover:text-white/60 hover:bg-white/5'
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={goToNext}
            disabled={currentPage === totalPages}
            className="flex items-center gap-1 text-sm text-white/40 hover:text-teal-400 disabled:opacity-25 transition-colors"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {selectedLocation && (
        <LocationDetailModal
          location={selectedLocation}
          onClose={() => { setSelectedLocation(null); void loadLocations(); }}
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

