import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, MapPin, RefreshCw, ChevronLeft, ChevronRight, BookOpen, LayoutGrid, Home, Briefcase, Plane, Coffee, Heart, Building2 } from 'lucide-react';
import { LocationProfileCard, type LocationProfile } from './LocationProfileCard';
import { LocationDetailModal } from './LocationDetailModal';
import { Button } from '../ui/button';
import { SearchWithAutocomplete } from '../ui/SearchWithAutocomplete';
import { Card, CardContent } from '../ui/card';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
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
      { id: 'person-7', name: 'Dr. Maya Patel', total_mentions: 12, entryCount: 4 }
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
  const [viewMode, setViewMode] = useState<'grid' | 'book'>('book');
  const [selectedTab, setSelectedTab] = useState('all');
  const { entries = [], chapters = [], timeline, refreshEntries, refreshTimeline } = useLoreKeeper();

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
  }, [searchTerm, viewMode, selectedTab]);

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

  return (
    <div className="space-y-6">
      <ChatFirstViewHint />
      {/* Location Search Bar and Controls */}
      <div className="space-y-4">
        <SearchWithAutocomplete<LocationProfile>
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search locations by name, people, tags, or chapters..."
          items={locations}
          getSearchableText={(loc) =>
            [
              loc.name,
              ...(loc.relatedPeople?.map((p) => p.name) ?? []),
              ...(loc.tagCounts?.map((t) => t.tag) ?? []),
              ...(loc.chapters?.map((c) => c.title).filter(Boolean) ?? []),
            ].filter(Boolean).join(' ')
          }
          getDisplayLabel={(loc) => loc.name}
          maxSuggestions={8}
          className="w-full"
          inputClassName="bg-black/40 border-border/50 text-white placeholder:text-white/40 text-sm sm:text-base"
          emptyHint="No matching locations"
        />
        
        {/* Navigation Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="w-full bg-black/40 border border-border/50 p-1 h-auto flex flex-wrap gap-1">
            <TabsTrigger value="all" className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0">
              <MapPin className="h-3 w-3 sm:h-4 sm:w-4" /> <span>All</span>
            </TabsTrigger>
            <TabsTrigger value="work" className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0">
              <Briefcase className="h-3 w-3 sm:h-4 sm:w-4" /> <span>Work</span>
            </TabsTrigger>
            <TabsTrigger value="home" className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0">
              <Home className="h-3 w-3 sm:h-4 sm:w-4" /> <span>Home</span>
            </TabsTrigger>
            <TabsTrigger value="travel" className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0">
              <Plane className="h-3 w-3 sm:h-4 sm:w-4" /> <span>Travel</span>
            </TabsTrigger>
            <TabsTrigger value="social" className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0">
              <Coffee className="h-3 w-3 sm:h-4 sm:w-4" /> <span>Social</span>
            </TabsTrigger>
            <TabsTrigger value="nature" className="flex items-center gap-1 sm:gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0">
              <Heart className="h-3 w-3 sm:h-4 sm:w-4" /> <span>Nature</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-white">Location Book</h2>
            <p className="text-xs sm:text-sm text-white/60 mt-1">
              {locations.length} locations · {filteredLocations.length} shown
              {totalPages > 1 && ` · Page ${currentPage}/${totalPages}`}
              {loading && ' · Loading...'}
            </p>
          </div>
          <Button 
            leftIcon={<RefreshCw className="h-3 w-3 sm:h-4 sm:w-4" />} 
            onClick={() => void loadLocations()}
            disabled={loading}
            size="sm"
            className="w-full sm:w-auto text-xs sm:text-sm"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="bg-black/40 border-border/50 aspect-square sm:aspect-auto sm:h-48 animate-pulse" />
          ))}
        </div>
      ) : filteredLocations.length === 0 ? (
        <div className="text-center py-8 sm:py-12 text-white/60 px-4">
          <MapPin className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 text-white/20" />
          <p className="text-base sm:text-lg font-medium mb-2">No locations found</p>
          <p className="text-xs sm:text-sm">Try a different search term or mention locations in chat to auto-create them</p>
        </div>
      ) : (
        <>
          {/* Book Page Container with Grid Inside */}
          <div className="relative w-full min-h-[400px] sm:min-h-[500px] lg:min-h-[600px] bg-gradient-to-br from-amber-50/5 via-amber-100/5 to-amber-50/5 rounded-lg border-2 border-amber-800/30 shadow-2xl overflow-hidden">
            {/* Page Content */}
            <div className="p-4 sm:p-6 lg:p-8 flex flex-col">
              {/* Page Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-amber-800/20">
                <div className="flex items-center gap-2 sm:gap-3">
                  <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600/60 flex-shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-semibold text-amber-900/40 uppercase tracking-wider">
                      Location Book
                    </h3>
                    <p className="text-[10px] sm:text-xs text-amber-700/50 mt-0.5">
                      Page {currentPage}/{totalPages} · {filteredLocations.length} locations
                    </p>
                  </div>
                </div>
                <div className="text-[10px] sm:text-xs text-amber-700/40 font-mono flex-shrink-0">
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>

              {/* Location Grid - 2 cols on mobile for square cards */}
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-2 gap-2 sm:gap-4 mb-4 sm:mb-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {paginatedLocations.map((location, index) => {
                  try {
                    return (
                      <LocationProfileCard
                        key={location.id || `loc-${index}`}
                        location={location}
                        onClick={() => setSelectedLocation(location)}
                      />
                    );
                  } catch {
                    return null;
                  }
                })}
              </div>

              {/* Page Footer with Navigation */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 pt-3 sm:pt-4 border-t border-amber-800/20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPrevious}
                  disabled={currentPage === 1}
                  className="text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10 disabled:opacity-30 w-full sm:w-auto text-xs sm:text-sm"
                >
                  <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  Previous
                </Button>

                <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-1 sm:gap-2 flex-wrap justify-center">
                  {/* Page indicators */}
                  <div className="flex items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1 bg-black/40 rounded-lg border border-amber-800/30 overflow-x-auto">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 7) {
                        pageNum = i + 1;
                      } else if (currentPage <= 4) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 3) {
                        pageNum = totalPages - 6 + i;
                      } else {
                        pageNum = currentPage - 3 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => goToPage(pageNum)}
                          className={`px-1.5 sm:px-2 py-1 rounded text-xs sm:text-sm transition touch-manipulation ${
                            currentPage === pageNum
                              ? 'bg-amber-600 text-white'
                              : 'text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-xs sm:text-sm text-amber-700/50 whitespace-nowrap">
                    {startIndex + 1}-{Math.min(endIndex, filteredLocations.length)} of {filteredLocations.length}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNext}
                  disabled={currentPage === totalPages}
                  className="text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10 disabled:opacity-30 w-full sm:w-auto text-xs sm:text-sm"
                >
                  Next
                  <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* Book Binding Effect */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-900/40 via-amber-800/30 to-amber-900/40" />
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-900/40 via-amber-800/30 to-amber-900/40" />
          </div>
        </>
      )}

      {/* Horizontal Timeline Component - Always at bottom */}
      <div className="mt-8 pt-6 border-t border-border/50">
        <div className="mb-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            Timeline
          </h3>
          <p className="text-sm text-white/60 mt-1">
            {chapters.length > 0 || entries.length > 0
              ? `View your story timeline with ${chapters.length} chapter${chapters.length !== 1 ? 's' : ''} and ${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'}`
              : 'Your timeline will appear here as you create chapters and entries'}
          </p>
        </div>
        <Card className="bg-black/40 border-border/60 overflow-hidden">
          <CardContent className="p-0 overflow-x-hidden">
            <div className="overflow-x-auto overflow-y-hidden">
              <ColorCodedTimeline
                chapters={chapters.length > 0 ? chapters.map(ch => ({
                  id: ch.id,
                  title: ch.title,
                  start_date: ch.start_date || ch.startDate || new Date().toISOString(),
                  end_date: ch.end_date || ch.endDate || null,
                  description: ch.description || null,
                  summary: ch.summary || null
                })) : []}
                entries={entries.length > 0 ? entries.map(entry => ({
                  id: entry.id,
                  content: entry.content,
                  date: entry.date,
                  chapter_id: entry.chapter_id || entry.chapterId || null
                })) : []}
                useDummyData={chapters.length === 0 && entries.length === 0}
                showLabel={true}
                onItemClick={async (item) => {
                  if (item.type === 'entry' || item.entryId || (item.id && entries.some(e => e.id === item.id))) {
                    const entryId = item.entryId || item.id;
                    const entry = entries.find(e => e.id === entryId);
                    if (entry) {
                      const memoryCard = memoryEntryToCard({
                        id: entry.id,
                        date: entry.date,
                        content: entry.content,
                        summary: entry.summary || null,
                        tags: entry.tags || [],
                        mood: entry.mood || null,
                        chapter_id: entry.chapter_id || null,
                        source: entry.source || 'manual',
                        metadata: entry.metadata || {}
                      });
                      setSelectedMemory(memoryCard);
                    } else {
                      try {
                        const fetchedEntry = await fetchJson<{
                          id: string;
                          date: string;
                          content: string;
                          summary?: string | null;
                          tags: string[];
                          mood?: string | null;
                          chapter_id?: string | null;
                          source: string;
                          metadata?: Record<string, unknown>;
                        }>(`/api/entries/${entryId}`);
                        const memoryCard = memoryEntryToCard(fetchedEntry);
                        setSelectedMemory(memoryCard);
                      } catch (error) {
                        console.error('Failed to load entry:', error);
                      }
                    }
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedLocation && (
        <LocationDetailModal
          location={selectedLocation}
          onClose={() => {
            setSelectedLocation(null);
          }}
          onUpdate={() => {
            void loadLocations();
            setSelectedLocation(null);
          }}
        />
      )}

      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
          onNavigate={(memoryId) => {
            const memory = allMemories.find(m => m.id === memoryId);
            if (memory) {
              setSelectedMemory(memory);
            }
          }}
          allMemories={allMemories}
        />
      )}
    </div>
  );
};

