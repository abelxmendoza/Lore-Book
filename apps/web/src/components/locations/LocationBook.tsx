import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, MapPin, RefreshCw, ChevronLeft, ChevronRight, BookOpen, LayoutGrid, Home, Briefcase, Plane, Coffee, Heart, Building2 } from 'lucide-react';
import { LocationProfileCard, type LocationProfile } from './LocationProfileCard';
import { LocationDetailModal } from './LocationDetailModal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';

// Comprehensive mock location data showcasing all app capabilities
const dummyLocations: LocationProfile[] = [
  {
    id: 'dummy-loc-1',
    name: 'San Francisco Tech Hub',
    visitCount: 12,
    firstVisited: '2024-01-15T10:00:00Z',
    lastVisited: '2024-03-20T14:30:00Z',
    coordinates: { lat: 37.7749, lng: -122.4194 },
    relatedPeople: [
      { id: 'person-1', name: 'Sarah Chen', total_mentions: 45, entryCount: 8 },
      { id: 'person-2', name: 'Marcus', total_mentions: 30, entryCount: 5 }
    ],
    tagCounts: [
      { tag: 'work', count: 8 },
      { tag: 'meeting', count: 5 },
      { tag: 'networking', count: 3 }
    ],
    chapters: [
      { id: 'ch-1', title: 'Tech Adventures', count: 6 },
      { id: 'ch-2', title: 'Career Growth', count: 4 }
    ],
    moods: [
      { mood: 'excited', count: 5 },
      { mood: 'focused', count: 4 }
    ],
    entries: [],
    sources: ['journal', 'calendar']
  },
  {
    id: 'dummy-loc-2',
    name: 'Golden Gate Park',
    visitCount: 8,
    firstVisited: '2024-02-01T09:00:00Z',
    lastVisited: '2024-03-15T16:00:00Z',
    coordinates: { lat: 37.7694, lng: -122.4862 },
    relatedPeople: [
      { id: 'person-1', name: 'Sarah Chen', total_mentions: 45, entryCount: 6 }
    ],
    tagCounts: [
      { tag: 'nature', count: 6 },
      { tag: 'relaxation', count: 4 },
      { tag: 'exercise', count: 3 }
    ],
    chapters: [
      { id: 'ch-3', title: 'Weekend Escapes', count: 5 }
    ],
    moods: [
      { mood: 'peaceful', count: 5 },
      { mood: 'energized', count: 3 }
    ],
    entries: [],
    sources: ['journal', 'photo']
  },
  {
    id: 'dummy-loc-3',
    name: 'Home Office',
    visitCount: 45,
    firstVisited: '2024-01-01T08:00:00Z',
    lastVisited: '2024-03-25T18:00:00Z',
    coordinates: null,
    relatedPeople: [],
    tagCounts: [
      { tag: 'work', count: 30 },
      { tag: 'focus', count: 25 },
      { tag: 'productivity', count: 20 }
    ],
    chapters: [
      { id: 'ch-1', title: 'Tech Adventures', count: 20 },
      { id: 'ch-2', title: 'Career Growth', count: 15 }
    ],
    moods: [
      { mood: 'focused', count: 20 },
      { mood: 'productive', count: 15 }
    ],
    entries: [],
    sources: ['journal', 'task']
  },
  {
    id: 'dummy-loc-4',
    name: 'Coffee Shop Downtown',
    visitCount: 23,
    firstVisited: '2024-01-10T08:00:00Z',
    lastVisited: '2024-03-22T15:00:00Z',
    coordinates: { lat: 37.7849, lng: -122.4094 },
    relatedPeople: [
      { id: 'person-3', name: 'Alex Rivera', total_mentions: 15, entryCount: 4 }
    ],
    tagCounts: [
      { tag: 'coffee', count: 15 },
      { tag: 'work', count: 8 },
      { tag: 'social', count: 5 }
    ],
    chapters: [
      { id: 'ch-4', title: 'Daily Routines', count: 12 }
    ],
    moods: [
      { mood: 'calm', count: 12 },
      { mood: 'creative', count: 8 }
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
    firstVisited: '2024-01-20T10:00:00Z',
    lastVisited: '2024-03-18T16:00:00Z',
    coordinates: { lat: 37.7549, lng: -122.4394 },
    relatedPeople: [
      { id: 'person-5', name: 'Sophia Anderson', total_mentions: 8, entryCount: 2 }
    ],
    tagCounts: [
      { tag: 'study', count: 12 },
      { tag: 'quiet', count: 10 },
      { tag: 'learning', count: 8 }
    ],
    chapters: [
      { id: 'ch-7', title: 'Learning Journey', count: 12 }
    ],
    moods: [
      { mood: 'focused', count: 12 },
      { mood: 'calm', count: 8 }
    ],
    entries: [],
    sources: ['journal']
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
    name: 'Art Gallery',
    visitCount: 7,
    firstVisited: '2024-02-05T14:00:00Z',
    lastVisited: '2024-03-15T16:00:00Z',
    coordinates: { lat: 37.7749, lng: -122.4094 },
    relatedPeople: [
      { id: 'person-8', name: 'River Song', total_mentions: 6, entryCount: 2 }
    ],
    tagCounts: [
      { tag: 'art', count: 6 },
      { tag: 'culture', count: 5 },
      { tag: 'inspiration', count: 4 }
    ],
    chapters: [
      { id: 'ch-10', title: 'Creative Exploration', count: 5 }
    ],
    moods: [
      { mood: 'inspired', count: 5 },
      { mood: 'reflective', count: 3 }
    ],
    entries: [],
    sources: ['journal', 'photo']
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

const ITEMS_PER_PAGE = 12; // 4 columns × 3 rows for grid view

export const LocationBook = () => {
  const [locations, setLocations] = useState<LocationProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
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
      setLocations(locationList.length > 0 ? locationList : dummyLocations);
    } catch {
      setLocations(dummyLocations);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLocations();
  }, []);

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
      {/* Location Search Bar and Controls */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            type="text"
            placeholder="Search locations by name, people, tags, or chapters..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40"
          />
        </div>
        
        {/* Navigation Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6 h-auto bg-black/40 border border-border/50 p-1 rounded-lg">
            <TabsTrigger value="all" className="flex items-center gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <MapPin className="h-4 w-4" /> All
            </TabsTrigger>
            <TabsTrigger value="work" className="flex items-center gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <Briefcase className="h-4 w-4" /> Work
            </TabsTrigger>
            <TabsTrigger value="home" className="flex items-center gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <Home className="h-4 w-4" /> Home
            </TabsTrigger>
            <TabsTrigger value="travel" className="flex items-center gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <Plane className="h-4 w-4" /> Travel
            </TabsTrigger>
            <TabsTrigger value="social" className="flex items-center gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <Coffee className="h-4 w-4" /> Social
            </TabsTrigger>
            <TabsTrigger value="nature" className="flex items-center gap-2 text-white/70 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-none">
              <Heart className="h-4 w-4" /> Nature
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Location Book</h2>
            <p className="text-sm text-white/60 mt-1">
              {filteredLocations.length} locations · {filteredLocations.length} shown
              {totalPages > 1 && ` · Page ${currentPage} of ${totalPages}`}
              {loading && ' · Loading...'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'book' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('book')}
              leftIcon={<BookOpen className="h-4 w-4" />}
            >
              Book
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
              leftIcon={<LayoutGrid className="h-4 w-4" />}
            >
              Grid
            </Button>
            <Button 
              leftIcon={<RefreshCw className="h-4 w-4" />} 
              onClick={() => void loadLocations()}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="bg-black/40 border-border/50 h-48 animate-pulse" />
          ))}
        </div>
      ) : filteredLocations.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <MapPin className="h-12 w-12 mx-auto mb-4 text-white/20" />
          <p className="text-lg font-medium mb-2">No locations found</p>
          <p className="text-sm">Try a different search term or mention locations in chat to auto-create them</p>
        </div>
      ) : (
        <>
          {/* Book Page Container with Grid Inside */}
          <div className="relative w-full min-h-[600px] bg-gradient-to-br from-amber-50/5 via-amber-100/5 to-amber-50/5 rounded-lg border-2 border-amber-800/30 shadow-2xl overflow-hidden">
            {/* Page Content */}
            <div className="p-8 flex flex-col">
              {/* Page Header */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-amber-800/20">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-6 w-6 text-amber-600/60" />
                  <div>
                    <h3 className="text-sm font-semibold text-amber-900/40 uppercase tracking-wider">
                      Location Book
                    </h3>
                    <p className="text-xs text-amber-700/50 mt-0.5">
                      Page {currentPage} of {totalPages}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-amber-700/40 font-mono">
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>

              {/* Location Grid */}
              <div className="flex-1 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-6">
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
              <div className="flex items-center justify-between pt-4 border-t border-amber-800/20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPrevious}
                  disabled={currentPage === 1}
                  className="text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {/* Page indicators */}
                  <div className="flex items-center gap-1 px-3 py-1 bg-black/40 rounded-lg border border-amber-800/30">
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
                          className={`px-2 py-1 rounded text-sm transition ${
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
                  <span className="text-sm text-amber-700/50">
                    {startIndex + 1}-{Math.min(endIndex, filteredLocations.length)} of {filteredLocations.length}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNext}
                  disabled={currentPage === totalPages}
                  className="text-amber-700/60 hover:text-amber-600 hover:bg-amber-500/10 disabled:opacity-30"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
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

