// =====================================================
// EVENTS BOOK
// Purpose: Full-page book component listing all events
// Enhanced with advanced filters and optimized for large datasets
// =====================================================

import { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, MapPin, Users, Sparkles, AlertCircle, Search, BookOpen, RefreshCw, ChevronLeft, ChevronRight, Star, TrendingUp, AlertTriangle, Filter, X, Grid3x3, List, SortAsc, SortDesc, SlidersHorizontal, HelpCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { format, parseISO, subDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { EventDetailModal } from './EventDetailModal';
import { EventProfileCard, type Event } from './EventProfileCard';
import { EventCardExample } from './EventCardExample';
import { EventCardExampleModal } from './EventCardExampleModal';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { shouldUseMockData } from '../../hooks/useShouldUseMockData';

const ITEMS_PER_PAGE = 24; // Increased for better performance with large datasets
const ITEMS_PER_PAGE_OPTIONS = [12, 24, 48, 96];

type EventCategory = 'all' | 'recent' | 'high_confidence' | 'low_confidence' | 'with_people' | 'with_locations';
type SortOption = 'date_desc' | 'date_asc' | 'confidence_desc' | 'confidence_asc' | 'title_asc' | 'title_desc' | 'people_desc';
type ViewMode = 'grid' | 'list';
type DateRange = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';

interface FilterState {
  dateRange: DateRange;
  customStartDate?: string;
  customEndDate?: string;
  types: string[];
  confidenceMin: number;
  confidenceMax: number;
  peopleCountMin: number;
  peopleCountMax: number;
  locations: string[];
  hasLocation: boolean | null;
  hasPeople: boolean | null;
}

// Generate comprehensive mock events data (50+ events)
const generateMockEvents = (): Event[] => {
  const eventTypes = ['work', 'social', 'health', 'recreation', 'travel', 'education', 'family', 'personal'];
  const locations = ['Home', 'Office', 'Café', 'Park', 'Gym', 'Cinema', 'Restaurant', 'Library', 'Beach', 'Mountain Trail', 'Airport', 'Hotel', 'School', 'Hospital', 'Museum'];
  const peopleNames = ['Alex', 'Sarah', 'John', 'Maria', 'David', 'Emma', 'Mike', 'Lisa', 'Tom', 'Anna', 'Chris', 'Sophie', 'Mom', 'Dad', 'Sister', 'Brother', 'Dr. Smith', 'Dr. Johnson'];
  const activities = ['meeting', 'coffee', 'hiking', 'workout', 'dinner', 'movie', 'reading', 'coding', 'traveling', 'learning', 'celebrating', 'shopping', 'cooking', 'exercising', 'studying', 'planning'];
  
  const events: Event[] = [];
  const now = Date.now();
  
  // Generate events over the past year
  for (let i = 0; i < 60; i++) {
    const daysAgo = Math.floor(Math.random() * 365);
    const hoursAgo = Math.floor(Math.random() * 24);
    const startTime = new Date(now - daysAgo * 24 * 60 * 60 * 1000 - hoursAgo * 60 * 60 * 1000);
    const duration = Math.floor(Math.random() * 8) + 1; // 1-8 hours
    const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000);
    
    const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const peopleCount = Math.random() > 0.3 ? Math.floor(Math.random() * 5) : 0;
    const locationCount = Math.random() > 0.2 ? Math.floor(Math.random() * 2) + 1 : 0;
    const confidence = Math.random() * 0.4 + 0.5; // 0.5-0.9
    
    const eventPeople = peopleCount > 0 
      ? Array.from({ length: peopleCount }, () => peopleNames[Math.floor(Math.random() * peopleNames.length)])
      : [];
    
    const eventLocations = locationCount > 0
      ? Array.from({ length: locationCount }, () => locations[Math.floor(Math.random() * locations.length)])
      : [];
    
    const eventActivities = Array.from(
      { length: Math.floor(Math.random() * 3) + 1 },
      () => activities[Math.floor(Math.random() * activities.length)]
    );
    
    const titles = {
      work: ['Team Meeting', 'Project Review', 'Client Presentation', 'Strategy Session', 'Code Review', 'Sprint Planning'],
      social: ['Coffee with Friend', 'Birthday Party', 'Dinner Out', 'Game Night', 'Concert', 'Festival'],
      health: ['Gym Session', 'Doctor Appointment', 'Yoga Class', 'Running', 'Meditation', 'Therapy Session'],
      recreation: ['Weekend Hiking', 'Movie Night', 'Beach Day', 'Camping Trip', 'Concert', 'Art Gallery'],
      travel: ['Business Trip', 'Vacation', 'Weekend Getaway', 'Conference', 'Family Visit', 'Road Trip'],
      education: ['Workshop', 'Online Course', 'Study Group', 'Seminar', 'Lecture', 'Training'],
      family: ['Family Dinner', 'Birthday Celebration', 'Holiday Gathering', 'Family Outing', 'Anniversary', 'Reunion'],
      personal: ['Shopping', 'Reading', 'Cooking', 'Gardening', 'Photography', 'Writing']
    };
    
    const summaries = {
      work: ['Productive session', 'Great collaboration', 'Important decisions made', 'Progress update', 'Planning ahead'],
      social: ['Great time with friends', 'Caught up on life', 'Fun evening', 'Memorable gathering', 'Enjoyed the company'],
      health: ['Good workout', 'Regular checkup', 'Feeling refreshed', 'Healthy routine', 'Wellness focus'],
      recreation: ['Relaxing day', 'Fun activity', 'Enjoyed the outdoors', 'Creative time', 'Entertainment'],
      travel: ['New experiences', 'Explored new places', 'Business networking', 'Cultural immersion', 'Adventure'],
      education: ['Learned something new', 'Skill development', 'Knowledge sharing', 'Professional growth', 'Academic progress'],
      family: ['Quality time', 'Family bonding', 'Celebrated together', 'Shared memories', 'Love and connection'],
      personal: ['Me time', 'Personal growth', 'Creative expression', 'Self-care', 'Hobby time']
    };
    
    const typeTitles = titles[type as keyof typeof titles] || ['Event'];
    const typeSummaries = summaries[type as keyof typeof summaries] || ['Event occurred'];
    
    events.push({
      id: `event-${i + 1}`,
      title: typeTitles[Math.floor(Math.random() * typeTitles.length)],
      summary: typeSummaries[Math.floor(Math.random() * typeSummaries.length)],
      type,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      confidence,
      people: eventPeople,
      locations: eventLocations,
      activities: eventActivities,
      source_count: Math.floor(Math.random() * 5) + 1,
      created_at: startTime.toISOString(),
      updated_at: startTime.toISOString()
    });
  }
  
  return events;
};

const MOCK_EVENTS = generateMockEvents();

export const EventsBook: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<EventCategory>('all');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [allMemories, setAllMemories] = useState<MemoryCard[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(ITEMS_PER_PAGE);
  const [sortBy, setSortBy] = useState<SortOption>('date_desc'); // Default: newest first
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [showExampleModal, setShowExampleModal] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    dateRange: 'all',
    types: [],
    confidenceMin: 0,
    confidenceMax: 1,
    peopleCountMin: 0,
    peopleCountMax: 10,
    locations: [],
    hasLocation: null,
    hasPeople: null
  });
  
  const { entries = [], chapters = [] } = useLoreKeeper();
  const isMockDataEnabled = shouldUseMockData();

  useEffect(() => {
    void loadEvents();
  }, [isMockDataEnabled]);

  // Convert entries to MemoryCard format for modal
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

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    
    // If mock data is enabled, use it directly
    if (isMockDataEnabled) {
      setEvents(MOCK_EVENTS);
      setError(null);
      setLoading(false);
      return;
    }
    
    try {
      const result = await fetchJson<{ success: boolean; events: Event[] }>('/api/conversation/events');
      if (result.success && result.events && result.events.length > 0) {
        setEvents(result.events);
      } else {
        setEvents([]);
        setError(result.success ? 'No events found' : 'Failed to load events');
      }
    } catch (err: any) {
      console.error('Failed to load events:', err);
      setEvents([]);
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  // Get unique values for filter options
  const uniqueTypes = useMemo(() => {
    const types = new Set(events.map(e => e.type).filter(Boolean));
    return Array.from(types).sort();
  }, [events]);

  const uniqueLocations = useMemo(() => {
    const locs = new Set(events.flatMap(e => e.locations));
    return Array.from(locs).sort();
  }, [events]);

  // Advanced filtering
  const filteredEvents = useMemo(() => {
    let filtered = [...events];

    // Date range filter
    if (filters.dateRange !== 'all') {
      const now = new Date();
      let startDate: Date;
      let endDate: Date = endOfDay(now);

      switch (filters.dateRange) {
        case 'today':
          startDate = startOfDay(now);
          break;
        case 'week':
          startDate = startOfDay(subDays(now, 7));
          break;
        case 'month':
          startDate = startOfDay(subDays(now, 30));
          break;
        case 'year':
          startDate = startOfDay(subDays(now, 365));
          break;
        case 'custom':
          if (filters.customStartDate && filters.customEndDate) {
            startDate = startOfDay(parseISO(filters.customStartDate));
            endDate = endOfDay(parseISO(filters.customEndDate));
          } else {
            return filtered;
          }
          break;
        default:
          return filtered;
      }

      filtered = filtered.filter(event => {
        const eventDate = parseISO(event.start_time);
        return isWithinInterval(eventDate, { start: startDate, end: endDate });
      });
    }

    // Type filter
    if (filters.types.length > 0) {
      filtered = filtered.filter(event => 
        event.type && filters.types.includes(event.type)
      );
    }

    // Confidence filter
    filtered = filtered.filter(event => 
      event.confidence >= filters.confidenceMin && 
      event.confidence <= filters.confidenceMax
    );

    // People count filter
    filtered = filtered.filter(event => 
      event.people.length >= filters.peopleCountMin && 
      event.people.length <= filters.peopleCountMax
    );

    // Location filter
    if (filters.locations.length > 0) {
      filtered = filtered.filter(event =>
        event.locations.some(loc => filters.locations.includes(loc))
      );
    }

    // Has location filter
    if (filters.hasLocation !== null) {
      filtered = filtered.filter(event =>
        filters.hasLocation ? event.locations.length > 0 : event.locations.length === 0
      );
    }

    // Has people filter
    if (filters.hasPeople !== null) {
      filtered = filtered.filter(event =>
        filters.hasPeople ? event.people.length > 0 : event.people.length === 0
      );
    }

    // Legacy category filter (for backward compatibility)
    if (activeCategory !== 'all') {
      filtered = filtered.filter(event => {
        switch (activeCategory) {
          case 'recent':
            const thirtyDaysAgo = subDays(new Date(), 30);
            return parseISO(event.start_time) >= thirtyDaysAgo;
          case 'high_confidence':
            return event.confidence >= 0.7;
          case 'low_confidence':
            return event.confidence < 0.4;
          case 'with_people':
            return event.people.length > 0;
          case 'with_locations':
            return event.locations.length > 0;
          default:
            return true;
        }
      });
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (event) =>
          event.title.toLowerCase().includes(term) ||
          (event.summary && event.summary.toLowerCase().includes(term)) ||
          (event.type && event.type.toLowerCase().includes(term)) ||
          event.people.some(p => p.toLowerCase().includes(term)) ||
          event.locations.some(l => l.toLowerCase().includes(term)) ||
          event.activities.some(a => a.toLowerCase().includes(term))
      );
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date_desc':
          return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
        case 'date_asc':
          return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
        case 'confidence_desc':
          return b.confidence - a.confidence;
        case 'confidence_asc':
          return a.confidence - b.confidence;
        case 'title_asc':
          return a.title.localeCompare(b.title);
        case 'title_desc':
          return b.title.localeCompare(a.title);
        case 'people_desc':
          return b.people.length - a.people.length;
        default:
          return 0;
      }
    });

    return filtered;
  }, [events, searchTerm, activeCategory, filters, sortBy]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeCategory, filters, sortBy]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedEvents = filteredEvents.slice(startIndex, endIndex);

  // Arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowLeft' && currentPage > 1) {
        e.preventDefault();
        setCurrentPage(prev => prev - 1);
      } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
        e.preventDefault();
        setCurrentPage(prev => prev + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages]);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const goToPrevious = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const goToNext = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const clearFilters = () => {
    setFilters({
      dateRange: 'all',
      types: [],
      confidenceMin: 0,
      confidenceMax: 1,
      peopleCountMin: 0,
      peopleCountMax: 10,
      locations: [],
      hasLocation: null,
      hasPeople: null
    });
    setSearchTerm('');
    setActiveCategory('all');
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.dateRange !== 'all') count++;
    if (filters.types.length > 0) count++;
    if (filters.confidenceMin > 0 || filters.confidenceMax < 1) count++;
    if (filters.peopleCountMin > 0 || filters.peopleCountMax < 10) count++;
    if (filters.locations.length > 0) count++;
    if (filters.hasLocation !== null) count++;
    if (filters.hasPeople !== null) count++;
    if (searchTerm.trim()) count++;
    if (activeCategory !== 'all') count++;
    return count;
  }, [filters, searchTerm, activeCategory]);

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-400 mb-4">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm">{error}</p>
            </div>
            <Button onClick={() => void loadEvents()} variant="outline" size="sm">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Search and Controls */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              type="text"
              placeholder="Search events by title, summary, type, people, locations, or activities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40"
            />
          </div>
          
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-black/40 border border-border/50 rounded-lg p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode('grid')}
                className={`h-8 px-3 ${viewMode === 'grid' ? 'bg-primary/20 text-primary' : 'text-white/60'}`}
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode('list')}
                className={`h-8 px-3 ${viewMode === 'list' ? 'bg-primary/20 text-primary' : 'text-white/60'}`}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-9 px-3 bg-black/40 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="confidence_desc">High Confidence</option>
              <option value="confidence_asc">Low Confidence</option>
              <option value="title_asc">Title A-Z</option>
              <option value="title_desc">Title Z-A</option>
              <option value="people_desc">Most People</option>
            </select>

            {/* Filter Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={`relative ${activeFilterCount > 0 ? 'border-primary/50 bg-primary/10' : ''}`}
            >
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-primary text-white text-xs rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            {/* Items Per Page */}
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-9 px-3 bg-black/40 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {ITEMS_PER_PAGE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt} per page</option>
              ))}
            </select>

            {/* Show Example Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExample(!showExample)}
              className={showExample ? 'border-primary/50 bg-primary/10' : ''}
              title="Show example card with labels"
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              {showExample ? 'Hide Example' : 'Show Example'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />} 
              onClick={() => void loadEvents()}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Quick Category Tabs */}
        <Tabs value={activeCategory} onValueChange={(value) => setActiveCategory(value as EventCategory)}>
          <TabsList className="w-full bg-black/40 border border-border/50 p-1 h-auto">
            <TabsTrigger 
              value="all" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
            >
              <Calendar className="h-4 w-4" />
              All
            </TabsTrigger>
            <TabsTrigger 
              value="recent" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
            >
              <Clock className="h-4 w-4" />
              Recent
            </TabsTrigger>
            <TabsTrigger 
              value="high_confidence" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
            >
              <Star className="h-4 w-4" />
              High Confidence
            </TabsTrigger>
            <TabsTrigger 
              value="low_confidence" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
            >
              <AlertTriangle className="h-4 w-4" />
              Low Confidence
            </TabsTrigger>
            <TabsTrigger 
              value="with_people" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
            >
              <Users className="h-4 w-4" />
              With People
            </TabsTrigger>
            <TabsTrigger 
              value="with_locations" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
            >
              <MapPin className="h-4 w-4" />
              With Location
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <Card className="bg-gradient-to-br from-black/80 via-black/60 to-black/80 border-2 border-primary/30 shadow-xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 border border-primary/30">
                    <Filter className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      Advanced Filters
                    </h3>
                    {activeFilterCount > 0 && (
                      <p className="text-xs text-white/50 mt-0.5">
                        {activeFilterCount} {activeFilterCount === 1 ? 'filter' : 'filters'} active
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {activeFilterCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearFilters}
                      className="text-xs border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-500/70"
                    >
                      <X className="h-3 w-3 mr-1.5" />
                      Clear All
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFilters(false)}
                    className="h-8 w-8 p-0 hover:bg-white/10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Active Filter Badges */}
              {activeFilterCount > 0 && (
                <div className="mb-6 flex flex-wrap gap-2">
                  {filters.dateRange !== 'all' && (
                    <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs px-2 py-1">
                      Date: {filters.dateRange === 'custom' 
                        ? `${filters.customStartDate || '...'} to ${filters.customEndDate || '...'}`
                        : filters.dateRange.replace('_', ' ')}
                      <button
                        onClick={() => setFilters({ ...filters, dateRange: 'all', customStartDate: undefined, customEndDate: undefined })}
                        className="ml-2 hover:text-primary/70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {filters.types.length > 0 && (
                    <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs px-2 py-1">
                      Types: {filters.types.length}
                      <button
                        onClick={() => setFilters({ ...filters, types: [] })}
                        className="ml-2 hover:text-primary/70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {(filters.confidenceMin > 0 || filters.confidenceMax < 1) && (
                    <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs px-2 py-1">
                      Confidence: {Math.round(filters.confidenceMin * 100)}%-{Math.round(filters.confidenceMax * 100)}%
                      <button
                        onClick={() => setFilters({ ...filters, confidenceMin: 0, confidenceMax: 1 })}
                        className="ml-2 hover:text-primary/70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {(filters.peopleCountMin > 0 || filters.peopleCountMax < 10) && (
                    <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs px-2 py-1">
                      People: {filters.peopleCountMin}-{filters.peopleCountMax}
                      <button
                        onClick={() => setFilters({ ...filters, peopleCountMin: 0, peopleCountMax: 10 })}
                        className="ml-2 hover:text-primary/70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {filters.locations.length > 0 && (
                    <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs px-2 py-1">
                      Locations: {filters.locations.length}
                      <button
                        onClick={() => setFilters({ ...filters, locations: [] })}
                        className="ml-2 hover:text-primary/70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {filters.hasPeople !== null && (
                    <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs px-2 py-1">
                      {filters.hasPeople ? 'Has People' : 'No People'}
                      <button
                        onClick={() => setFilters({ ...filters, hasPeople: null })}
                        className="ml-2 hover:text-primary/70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {filters.hasLocation !== null && (
                    <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs px-2 py-1">
                      {filters.hasLocation ? 'Has Location' : 'No Location'}
                      <button
                        onClick={() => setFilters({ ...filters, hasLocation: null })}
                        className="ml-2 hover:text-primary/70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Date Range */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    Date Range
                  </label>
                  <select
                    value={filters.dateRange}
                    onChange={(e) => setFilters({ ...filters, dateRange: e.target.value as DateRange })}
                    className="w-full h-10 px-3 bg-black/60 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                    <option value="year">Last Year</option>
                    <option value="custom">Custom Range</option>
                  </select>
                  {filters.dateRange === 'custom' && (
                    <div className="mt-2 space-y-2">
                      <input
                        type="date"
                        value={filters.customStartDate || ''}
                        onChange={(e) => setFilters({ ...filters, customStartDate: e.target.value })}
                        className="w-full h-10 px-3 bg-black/60 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                        placeholder="Start date"
                      />
                      <input
                        type="date"
                        value={filters.customEndDate || ''}
                        onChange={(e) => setFilters({ ...filters, customEndDate: e.target.value })}
                        className="w-full h-10 px-3 bg-black/60 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                        placeholder="End date"
                      />
                    </div>
                  )}
                </div>

                {/* Type Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <Star className="h-4 w-4 text-primary" />
                    Event Type
                  </label>
                  <div className="max-h-40 overflow-y-auto p-2 bg-black/40 rounded-lg border border-border/30 space-y-2">
                    {uniqueTypes.length === 0 ? (
                      <p className="text-xs text-white/40 text-center py-2">No types available</p>
                    ) : (
                      uniqueTypes.map(type => (
                        <label key={type} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white/5 transition-colors group">
                          <input
                            type="checkbox"
                            checked={filters.types.includes(type)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilters({ ...filters, types: [...filters.types, type] });
                              } else {
                                setFilters({ ...filters, types: filters.types.filter(t => t !== type) });
                              }
                            }}
                            className="w-4 h-4 rounded border-border/50 bg-black/40 text-primary focus:ring-primary/50 focus:ring-2 checked:bg-primary checked:border-primary transition-colors"
                          />
                          <span className="text-sm text-white/80 capitalize group-hover:text-white transition-colors">{type}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Confidence Range */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Confidence Level
                  </label>
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-white/60">Min: {Math.round(filters.confidenceMin * 100)}%</span>
                        <span className="text-xs text-white/60">Max: {Math.round(filters.confidenceMax * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={filters.confidenceMin}
                        onChange={(e) => setFilters({ ...filters, confidenceMin: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-black/60 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                    <div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={filters.confidenceMax}
                        onChange={(e) => setFilters({ ...filters, confidenceMax: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-black/60 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/50">
                      <span className="flex-1 text-left">Low</span>
                      <span className="flex-1 text-center">Medium</span>
                      <span className="flex-1 text-right">High</span>
                    </div>
                  </div>
                </div>

                {/* People Count */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    People Count
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-white/60 mb-1 block">Min</label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={filters.peopleCountMin}
                        onChange={(e) => setFilters({ ...filters, peopleCountMin: parseInt(e.target.value) || 0 })}
                        className="w-full h-10 px-3 bg-black/60 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                      />
                    </div>
                    <span className="text-white/40 pt-6">-</span>
                    <div className="flex-1">
                      <label className="text-xs text-white/60 mb-1 block">Max</label>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={filters.peopleCountMax}
                        onChange={(e) => setFilters({ ...filters, peopleCountMax: parseInt(e.target.value) || 10 })}
                        className="w-full h-10 px-3 bg-black/60 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Location Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    Locations
                  </label>
                  <div className="max-h-40 overflow-y-auto p-2 bg-black/40 rounded-lg border border-border/30 space-y-2">
                    {uniqueLocations.length === 0 ? (
                      <p className="text-xs text-white/40 text-center py-2">No locations available</p>
                    ) : (
                      uniqueLocations.slice(0, 15).map(location => (
                        <label key={location} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white/5 transition-colors group">
                          <input
                            type="checkbox"
                            checked={filters.locations.includes(location)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilters({ ...filters, locations: [...filters.locations, location] });
                              } else {
                                setFilters({ ...filters, locations: filters.locations.filter(l => l !== location) });
                              }
                            }}
                            className="w-4 h-4 rounded border-border/50 bg-black/40 text-primary focus:ring-primary/50 focus:ring-2 checked:bg-primary checked:border-primary transition-colors"
                          />
                          <span className="text-sm text-white/80 group-hover:text-white transition-colors">{location}</span>
                        </label>
                      ))
                    )}
                    {uniqueLocations.length > 15 && (
                      <p className="text-xs text-white/40 text-center py-1">+{uniqueLocations.length - 15} more locations</p>
                    )}
                  </div>
                </div>

                {/* Boolean Filters */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-primary" />
                    Presence Filters
                  </label>
                  <div className="space-y-3 p-3 bg-black/40 rounded-lg border border-border/30">
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition-colors group">
                      <input
                        type="checkbox"
                        checked={filters.hasPeople === true}
                        onChange={(e) => setFilters({ ...filters, hasPeople: e.target.checked ? true : null })}
                        className="w-4 h-4 rounded border-border/50 bg-black/40 text-primary focus:ring-primary/50 focus:ring-2 checked:bg-primary checked:border-primary transition-colors"
                      />
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-white/40 group-hover:text-primary transition-colors" />
                        <span className="text-sm text-white/80 group-hover:text-white transition-colors">Has People</span>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition-colors group">
                      <input
                        type="checkbox"
                        checked={filters.hasLocation === true}
                        onChange={(e) => setFilters({ ...filters, hasLocation: e.target.checked ? true : null })}
                        className="w-4 h-4 rounded border-border/50 bg-black/40 text-primary focus:ring-primary/50 focus:ring-2 checked:bg-primary checked:border-primary transition-colors"
                      />
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-white/40 group-hover:text-primary transition-colors" />
                        <span className="text-sm text-white/80 group-hover:text-white transition-colors">Has Location</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Example Card with Labels */}
      {showExample && (
        <div className="mb-8 p-6 bg-black/40 border border-primary/30 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-primary" />
                Understanding Event Cards
              </h3>
              <p className="text-sm text-white/60">
                Each element on an event card tells you something about the event. Hover over elements to see tooltips, or click any card to see full details.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowExampleModal(true)}
                className="text-xs"
              >
                View Full Example
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowExample(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto pb-4">
            <div className="flex justify-center px-8">
              <EventCardExample />
            </div>
          </div>
        </div>
      )}

      <EventCardExampleModal 
        isOpen={showExampleModal} 
        onClose={() => setShowExampleModal(false)} 
      />

      {/* Results Summary */}
      <div className="flex items-center justify-between text-sm text-white/60">
        <div>
          Showing {startIndex + 1}-{Math.min(endIndex, filteredEvents.length)} of {filteredEvents.length} events
          {filteredEvents.length !== events.length && (
            <span className="ml-2 text-primary">({events.length} total)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalPages > 1 && (
            <span className="text-xs">
              Page {currentPage} of {totalPages}
            </span>
          )}
        </div>
      </div>

      {/* Events Display */}
      {loading ? (
        <div className={`grid gap-4 ${viewMode === 'grid' ? 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
          {Array.from({ length: itemsPerPage }).map((_, i) => (
            <Card key={i} className="bg-black/40 border-border/50 h-64 animate-pulse" />
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-white/20" />
          <p className="text-lg font-medium mb-2">No events found</p>
          <p className="text-sm">Try adjusting your filters or search term</p>
          {activeFilterCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="mt-4"
            >
              Clear All Filters
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Book Page Container with Grid Inside */}
          <div className="relative w-full min-h-[600px] bg-gradient-to-br from-blue-50/5 via-purple-100/5 to-pink-50/5 rounded-lg border-2 border-blue-800/30 shadow-2xl overflow-hidden">
            {/* Page Content */}
            <div className="p-8 flex flex-col">
              {/* Page Header */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-blue-800/20">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-6 w-6 text-blue-600/60" />
                  <div>
                    <h3 className="text-sm font-semibold text-blue-900/40 uppercase tracking-wider">
                      Events Book
                    </h3>
                    <p className="text-xs text-blue-700/50 mt-0.5">
                      Page {currentPage} of {totalPages} · {filteredEvents.length} events
                    </p>
                  </div>
                </div>
                <div className="text-xs text-blue-700/40 font-mono">
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>

              {/* Event Grid */}
              <div className={`flex-1 grid gap-4 mb-6 ${viewMode === 'grid' ? 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
                {paginatedEvents.length > 0 ? (
                  paginatedEvents.map((event, index) => {
                    try {
                      return (
                        <EventProfileCard
                          key={event.id || `event-${index}`}
                          event={event}
                          onClick={() => {
                            setSelectedEvent(event);
                          }}
                        />
                      );
                    } catch (error) {
                      console.error('Error rendering event card:', error, event);
                      return null;
                    }
                  })
                ) : (
                  <div className="col-span-full text-center py-8 text-white/60">
                    <p>No events to display</p>
                  </div>
                )}
              </div>

              {/* Page Footer with Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-blue-800/20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPrevious}
                  disabled={currentPage === 1}
                  className="text-blue-700/60 hover:text-blue-600 hover:bg-blue-500/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {/* Page indicators */}
                  <div className="flex items-center gap-1 px-3 py-1 bg-black/40 rounded-lg border border-blue-800/30">
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
                              ? 'bg-blue-600 text-white'
                              : 'text-blue-700/60 hover:text-blue-600 hover:bg-blue-500/10'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNext}
                  disabled={currentPage === totalPages}
                  className="text-blue-700/60 hover:text-blue-600 hover:bg-blue-500/10 disabled:opacity-30"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Timeline Integration */}
      {filteredEvents.length > 0 && (
        <div className="mt-8">
          <ColorCodedTimeline />
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* Memory Detail Modal */}
      {selectedMemory && (
        <MemoryDetailModal
          memory={selectedMemory}
          onClose={() => setSelectedMemory(null)}
        />
      )}
    </div>
  );
};
