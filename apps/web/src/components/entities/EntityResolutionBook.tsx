// =====================================================
// ENTITY RESOLUTION BOOK
// Purpose: Full-page book component for inspecting,
// merging, and correcting inferred entities
// =====================================================

import { useState, useEffect, useMemo } from 'react';
import { User, MapPin, Building2, Lightbulb, Sparkles, AlertCircle, Search, BookOpen, RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, Hash, Settings, Filter, X, Grid3x3, List, SlidersHorizontal, TrendingUp, Calendar, Clock } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { EntityProfileCard, type EntityCandidate } from './EntityProfileCard';
import { entityResolutionApi, type EntityConflict, type EntityType } from '../../api/entityResolution';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { memoryEntryToCard, type MemoryCard } from '../../types/memory';
import { MemoryDetailModal } from '../memory-explorer/MemoryDetailModal';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { EntityDetailModal } from './EntityDetailModal';
import { shouldUseMockData } from '../../hooks/useShouldUseMockData';
import { format, subDays } from 'date-fns';

const ITEMS_PER_PAGE = 24;
const ITEMS_PER_PAGE_OPTIONS = [12, 24, 48, 96];

type SortOption = 'usage_desc' | 'usage_asc' | 'name_asc' | 'name_desc' | 'confidence_desc' | 'confidence_asc' | 'recent';
type ViewMode = 'grid' | 'list';

// Generate comprehensive mock entities data
const generateMockEntities = (): EntityCandidate[] => {
  const now = new Date();
  const entityTypes: EntityType[] = ['CHARACTER', 'LOCATION', 'ORG', 'PERSON', 'CONCEPT'];
  const names = {
    CHARACTER: ['Alex Morgan', 'Sarah Chen', 'John Martinez', 'Emma Wilson', 'Michael Brown', 'Lisa Anderson', 'David Kim', 'Rachel Green', 'Tom Hanks', 'Sophie Turner'],
    LOCATION: ['Coffee Shop', 'Central Park', 'Office Building', 'Beach House', 'Mountain Trail', 'Library', 'Restaurant', 'Gym', 'Airport', 'Hotel'],
    ORG: ['Tech Corp', 'Design Studio', 'University', 'Hospital', 'Law Firm', 'Startup Inc', 'Non-Profit Org', 'Consulting Group', 'Media Company', 'Research Lab'],
    PERSON: ['Dr. Smith', 'Professor Johnson', 'Nurse Williams', 'Manager Davis', 'Director Lee'],
    CONCEPT: ['Friendship', 'Success', 'Creativity', 'Adventure', 'Growth', 'Innovation', 'Collaboration', 'Excellence']
  };

  const aliases = {
    CHARACTER: [['Alex', 'A.M.'], ['Sarah', 'S.C.'], ['John', 'J.M.'], ['Emma', 'E.W.'], ['Mike', 'M.B.']],
    LOCATION: [['Café', 'Coffee Place'], ['Park', 'Central'], ['Office', 'Work'], ['Beach', 'Shore'], ['Trail', 'Path']],
    ORG: [['Tech', 'TC'], ['Studio', 'DS'], ['Uni', 'University'], ['Hospital', 'Med Center'], ['Firm', 'Law']],
    PERSON: [['Doc', 'Doctor'], ['Prof', 'Professor'], ['Nurse', 'RN'], ['Mgr', 'Manager'], ['Dir', 'Director']],
    CONCEPT: [[], [], [], [], []]
  };

  const entities: EntityCandidate[] = [];
  let idCounter = 1;

  entityTypes.forEach(type => {
    const typeNames = names[type] || [];
    const typeAliases = aliases[type] || [];
    
    typeNames.forEach((name, index) => {
      const daysAgo = Math.floor(Math.random() * 90);
      const lastSeen = subDays(now, daysAgo);
      const usageCount = Math.floor(Math.random() * 50) + 1;
      const confidence = Math.random() * 0.4 + 0.6; // 0.6 to 1.0
      const hasConflict = Math.random() > 0.85; // 15% chance of conflict
      
      entities.push({
        entity_id: `mock-entity-${idCounter++}`,
        primary_name: name,
        aliases: typeAliases[index] || [],
        entity_type: type,
        confidence,
        usage_count: usageCount,
        last_seen: lastSeen.toISOString(),
        source_table: type === 'PERSON' ? 'omega_entities' : type === 'CONCEPT' ? 'entities' : type.toLowerCase() + 's',
        is_user_visible: type !== 'PERSON' && type !== 'CONCEPT',
        resolution_tier: type === 'CHARACTER' || type === 'LOCATION' || type === 'ORG' ? 'PRIMARY' : type === 'PERSON' ? 'SECONDARY' : 'TERTIARY',
        has_conflicts: hasConflict,
        conflict_count: hasConflict ? Math.floor(Math.random() * 3) + 1 : 0
      });
    });
  });

  // Add some additional entities with various characteristics
  for (let i = 0; i < 20; i++) {
    const type = entityTypes[Math.floor(Math.random() * entityTypes.length)];
    const daysAgo = Math.floor(Math.random() * 180);
    const lastSeen = subDays(now, daysAgo);
    const usageCount = Math.floor(Math.random() * 100);
    const confidence = Math.random();
    
    entities.push({
      entity_id: `mock-entity-${idCounter++}`,
      primary_name: `${type} Entity ${i + 1}`,
      aliases: [`Alias ${i + 1}`, `Alt ${i + 1}`],
      entity_type: type,
      confidence,
      usage_count: usageCount,
      last_seen: lastSeen.toISOString(),
      source_table: type === 'PERSON' ? 'omega_entities' : type === 'CONCEPT' ? 'entities' : type.toLowerCase() + 's',
      is_user_visible: type !== 'PERSON' && type !== 'CONCEPT',
      resolution_tier: type === 'CHARACTER' || type === 'LOCATION' || type === 'ORG' ? 'PRIMARY' : type === 'PERSON' ? 'SECONDARY' : 'TERTIARY',
      has_conflicts: Math.random() > 0.9,
      conflict_count: Math.random() > 0.9 ? Math.floor(Math.random() * 2) + 1 : 0
    });
  }

  return entities;
};

const MOCK_ENTITIES: EntityCandidate[] = generateMockEntities();

type EntityCategory = 'all' | 'people' | 'locations' | 'organizations' | 'concepts' | 'conflicts';

export const EntityResolutionBook: React.FC = () => {
  const [entities, setEntities] = useState<EntityCandidate[]>([]);
  const [conflicts, setConflicts] = useState<EntityConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<EntityCategory>('all');
  const [showAdvanced, setShowAdvanced] = useState(false); // Toggle for SECONDARY/TERTIARY
  const [selectedEntity, setSelectedEntity] = useState<EntityCandidate | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<MemoryCard | null>(null);
  const [allMemories, setAllMemories] = useState<MemoryCard[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(ITEMS_PER_PAGE);
  const [sortBy, setSortBy] = useState<SortOption>('usage_desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [filterTypes, setFilterTypes] = useState<EntityType[]>([]);
  const [filterConfidenceMin, setFilterConfidenceMin] = useState(0);
  const [filterConfidenceMax, setFilterConfidenceMax] = useState(1);
  const [filterUsageMin, setFilterUsageMin] = useState(0);
  const [filterUsageMax, setFilterUsageMax] = useState(100);
  const [filterHasConflicts, setFilterHasConflicts] = useState<boolean | null>(null);
  const isMockDataEnabled = shouldUseMockData();
  const { entries = [], chapters = [] } = useLoreKeeper();

  useEffect(() => {
    void loadData();
  }, [showAdvanced]);

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

  const loadData = async () => {
    setLoading(true);
    setError(null);

    if (isMockDataEnabled) {
      // Use mock data
      setEntities(MOCK_ENTITIES);
      setConflicts([]);
      setLoading(false);
      return;
    }

    try {
      // Load entities based on advanced mode
      // PRIMARY: Always loaded (CHARACTER, LOCATION, ORG)
      // SECONDARY: Loaded if showAdvanced (PERSON from omega_entities)
      // TERTIARY: Loaded if showAdvanced (CONCEPT, ENTITY)
      const [entitiesData, conflictsData] = await Promise.all([
        entityResolutionApi.listEntities({
          include_secondary: showAdvanced,
          include_tertiary: showAdvanced,
        }),
        entityResolutionApi.listConflicts(),
      ]);

      // Mark entities with conflicts
      const entityMap = new Map<string, EntityCandidate>();
      entitiesData.forEach(e => {
        entityMap.set(e.entity_id, { ...e, has_conflicts: false, conflict_count: 0 });
      });

      // Count conflicts per entity
      conflictsData.forEach(conflict => {
        if (conflict.status === 'OPEN') {
          const entityA = entityMap.get(conflict.entity_a_id);
          const entityB = entityMap.get(conflict.entity_b_id);
          if (entityA) {
            entityA.has_conflicts = true;
            entityA.conflict_count = (entityA.conflict_count || 0) + 1;
          }
          if (entityB) {
            entityB.has_conflicts = true;
            entityB.conflict_count = (entityB.conflict_count || 0) + 1;
          }
        }
      });

      setEntities(Array.from(entityMap.values()));
      setConflicts(conflictsData.filter(c => c.status === 'OPEN'));
    } catch (err: any) {
      console.error('Failed to load entity resolution data:', err);
      setEntities([]);
      setError(err.message || 'Failed to load entities');
    } finally {
      setLoading(false);
    }
  };

  // Get unique entity types for filters
  const uniqueTypes = useMemo(() => {
    const types = new Set(entities.map(e => e.entity_type));
    return Array.from(types).sort();
  }, [entities]);

  const filteredEntities = useMemo(() => {
    let filtered = [...entities];

    // Filter by tier: Only show user-visible entities by default
    if (!showAdvanced) {
      filtered = filtered.filter(entity => entity.is_user_visible === true);
    }

    // Filter by category
    if (activeCategory !== 'all') {
      filtered = filtered.filter(entity => {
        switch (activeCategory) {
          case 'people':
            return entity.entity_type === 'CHARACTER' || entity.entity_type === 'PERSON';
          case 'locations':
            return entity.entity_type === 'LOCATION';
          case 'organizations':
            return entity.entity_type === 'ORG';
          case 'concepts':
            return entity.entity_type === 'CONCEPT';
          case 'conflicts':
            return entity.has_conflicts === true;
          default:
            return true;
        }
      });
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (entity) =>
          entity.primary_name.toLowerCase().includes(term) ||
          entity.aliases.some(alias => alias.toLowerCase().includes(term)) ||
          entity.entity_type.toLowerCase().includes(term)
      );
    }

    // Advanced filters
    if (filterTypes.length > 0) {
      filtered = filtered.filter(entity => filterTypes.includes(entity.entity_type));
    }

    if (filterHasConflicts !== null) {
      filtered = filtered.filter(entity => 
        filterHasConflicts ? entity.has_conflicts === true : entity.has_conflicts !== true
      );
    }

    filtered = filtered.filter(entity => 
      entity.confidence >= filterConfidenceMin && 
      entity.confidence <= filterConfidenceMax
    );

    filtered = filtered.filter(entity => 
      entity.usage_count >= filterUsageMin && 
      entity.usage_count <= filterUsageMax
    );

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'usage_desc':
          if (a.has_conflicts && !b.has_conflicts) return -1;
          if (!a.has_conflicts && b.has_conflicts) return 1;
          return b.usage_count - a.usage_count;
        case 'usage_asc':
          return a.usage_count - b.usage_count;
        case 'name_asc':
          return a.primary_name.localeCompare(b.primary_name);
        case 'name_desc':
          return b.primary_name.localeCompare(a.primary_name);
        case 'confidence_desc':
          return b.confidence - a.confidence;
        case 'confidence_asc':
          return a.confidence - b.confidence;
        case 'recent':
          return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [entities, searchTerm, activeCategory, showAdvanced, filterTypes, filterConfidenceMin, filterConfidenceMax, filterUsageMin, filterUsageMax, filterHasConflicts, sortBy]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterTypes.length > 0) count++;
    if (filterConfidenceMin > 0 || filterConfidenceMax < 1) count++;
    if (filterUsageMin > 0 || filterUsageMax < 100) count++;
    if (filterHasConflicts !== null) count++;
    return count;
  }, [filterTypes, filterConfidenceMin, filterConfidenceMax, filterUsageMin, filterUsageMax, filterHasConflicts]);

  const clearFilters = () => {
    setFilterTypes([]);
    setFilterConfidenceMin(0);
    setFilterConfidenceMax(1);
    setFilterUsageMin(0);
    setFilterUsageMax(100);
    setFilterHasConflicts(null);
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeCategory, showAdvanced, filterTypes, filterConfidenceMin, filterConfidenceMax, filterUsageMin, filterUsageMax, filterHasConflicts, sortBy]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredEntities.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedEntities = filteredEntities.slice(startIndex, endIndex);

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

  const conflictCount = conflicts.length;
  const entitiesWithConflicts = entities.filter(e => e.has_conflicts).length;

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-400 mb-4">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm">{error}</p>
            </div>
            <Button onClick={() => void loadData()} variant="outline" size="sm">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Entity Search Bar and Navigation Tabs */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              type="text"
              placeholder="Search entities by name, alias, or type..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
              }}
              className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40"
            />
          </div>
          
          <div className="flex items-center gap-2">
            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="h-9 px-3 bg-black/40 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="usage_desc">Most Used</option>
              <option value="usage_asc">Least Used</option>
              <option value="name_asc">Name A-Z</option>
              <option value="name_desc">Name Z-A</option>
              <option value="confidence_desc">High Confidence</option>
              <option value="confidence_asc">Low Confidence</option>
              <option value="recent">Recently Seen</option>
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

            {/* View Mode */}
            <div className="flex items-center gap-1 bg-black/40 border border-border/50 rounded-lg p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode('grid')}
                className={`h-7 px-2 ${viewMode === 'grid' ? 'bg-primary/20 text-primary' : 'text-white/60'}`}
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode('list')}
                className={`h-7 px-2 ${viewMode === 'list' ? 'bg-primary/20 text-primary' : 'text-white/60'}`}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />} 
              onClick={() => void loadData()}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <Tabs value={activeCategory} onValueChange={(value) => setActiveCategory(value as EntityCategory)}>
          <TabsList className="w-full bg-black/40 border border-border/50 p-1 h-auto">
            <TabsTrigger 
              value="all" 
              className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
            >
              <Hash className="h-4 w-4" />
              <span>All</span>
            </TabsTrigger>
            <TabsTrigger 
              value="people"
              className="flex items-center gap-2 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400"
            >
              <User className="h-4 w-4" />
              <span>People</span>
            </TabsTrigger>
            <TabsTrigger 
              value="locations"
              className="flex items-center gap-2 data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400"
            >
              <MapPin className="h-4 w-4" />
              <span>Locations</span>
            </TabsTrigger>
            <TabsTrigger 
              value="organizations"
              className="flex items-center gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400"
            >
              <Building2 className="h-4 w-4" />
              <span>Organizations</span>
            </TabsTrigger>
            <TabsTrigger 
              value="concepts"
              className="flex items-center gap-2 data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-400"
            >
              <Lightbulb className="h-4 w-4" />
              <span>Concepts</span>
            </TabsTrigger>
            <TabsTrigger 
              value="conflicts"
              className="flex items-center gap-2 data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
            >
              <AlertTriangle className="h-4 w-4" />
              <span>Possible Duplicates</span>
              {conflictCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-orange-500/30 rounded text-xs">
                  {conflictCount}
                </span>
              )}
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
                  {filterTypes.length > 0 && (
                    <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs px-2 py-1">
                      Types: {filterTypes.length}
                      <button
                        onClick={() => setFilterTypes([])}
                        className="ml-2 hover:text-primary/70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {(filterConfidenceMin > 0 || filterConfidenceMax < 1) && (
                    <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs px-2 py-1">
                      Confidence: {Math.round(filterConfidenceMin * 100)}%-{Math.round(filterConfidenceMax * 100)}%
                      <button
                        onClick={() => { setFilterConfidenceMin(0); setFilterConfidenceMax(1); }}
                        className="ml-2 hover:text-primary/70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {(filterUsageMin > 0 || filterUsageMax < 100) && (
                    <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs px-2 py-1">
                      Usage: {filterUsageMin}-{filterUsageMax}
                      <button
                        onClick={() => { setFilterUsageMin(0); setFilterUsageMax(100); }}
                        className="ml-2 hover:text-primary/70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                  {filterHasConflicts !== null && (
                    <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-xs px-2 py-1">
                      {filterHasConflicts ? 'Has Conflicts' : 'No Conflicts'}
                      <button
                        onClick={() => setFilterHasConflicts(null)}
                        className="ml-2 hover:text-primary/70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Entity Type Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <Hash className="h-4 w-4 text-primary" />
                    Entity Type
                  </label>
                  <div className="max-h-40 overflow-y-auto p-2 bg-black/40 rounded-lg border border-border/30 space-y-2">
                    {uniqueTypes.map(type => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-white/5 transition-colors group">
                        <input
                          type="checkbox"
                          checked={filterTypes.includes(type)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFilterTypes([...filterTypes, type]);
                            } else {
                              setFilterTypes(filterTypes.filter(t => t !== type));
                            }
                          }}
                          className="w-4 h-4 rounded border-border/50 bg-black/40 text-primary focus:ring-primary/50 focus:ring-2 checked:bg-primary checked:border-primary transition-colors"
                        />
                        <span className="text-sm text-white/80 capitalize group-hover:text-white transition-colors">{type}</span>
                      </label>
                    ))}
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
                        <span className="text-xs text-white/60">Min: {Math.round(filterConfidenceMin * 100)}%</span>
                        <span className="text-xs text-white/60">Max: {Math.round(filterConfidenceMax * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={filterConfidenceMin}
                        onChange={(e) => setFilterConfidenceMin(parseFloat(e.target.value))}
                        className="w-full h-2 bg-black/60 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                    <div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={filterConfidenceMax}
                        onChange={(e) => setFilterConfidenceMax(parseFloat(e.target.value))}
                        className="w-full h-2 bg-black/60 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* Usage Count */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Usage Count
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-white/60 mb-1 block">Min</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={filterUsageMin}
                        onChange={(e) => setFilterUsageMin(parseInt(e.target.value) || 0)}
                        className="w-full h-10 px-3 bg-black/60 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                      />
                    </div>
                    <span className="text-white/40 pt-6">-</span>
                    <div className="flex-1">
                      <label className="text-xs text-white/60 mb-1 block">Max</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={filterUsageMax}
                        onChange={(e) => setFilterUsageMax(parseInt(e.target.value) || 100)}
                        className="w-full h-10 px-3 bg-black/60 border border-border/50 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Conflicts Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-primary" />
                    Conflicts
                  </label>
                  <div className="space-y-3 p-3 bg-black/40 rounded-lg border border-border/30">
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition-colors group">
                      <input
                        type="checkbox"
                        checked={filterHasConflicts === true}
                        onChange={(e) => setFilterHasConflicts(e.target.checked ? true : null)}
                        className="w-4 h-4 rounded border-border/50 bg-black/40 text-primary focus:ring-primary/50 focus:ring-2 checked:bg-primary checked:border-primary transition-colors"
                      />
                      <span className="text-sm text-white/80 group-hover:text-white transition-colors">Has Conflicts</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition-colors group">
                      <input
                        type="checkbox"
                        checked={filterHasConflicts === false}
                        onChange={(e) => setFilterHasConflicts(e.target.checked ? false : null)}
                        className="w-4 h-4 rounded border-border/50 bg-black/40 text-primary focus:ring-primary/50 focus:ring-2 checked:bg-primary checked:border-primary transition-colors"
                      />
                      <span className="text-sm text-white/80 group-hover:text-white transition-colors">No Conflicts</span>
                    </label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Entity Resolution Book</h2>
            <p className="text-sm text-white/60 mt-1">
              Showing {startIndex + 1}-{Math.min(endIndex, filteredEntities.length)} of {filteredEntities.length} entities
              {filteredEntities.length !== entities.length && (
                <span className="ml-2 text-primary">({entities.length} total)</span>
              )}
              {entitiesWithConflicts > 0 && ` · ${entitiesWithConflicts} with conflicts`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showAdvanced ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              leftIcon={<Settings className="h-4 w-4" />}
              className={showAdvanced ? 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border-orange-500/30' : ''}
            >
              {showAdvanced ? 'Advanced Mode' : 'Show All'}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={`grid gap-4 ${viewMode === 'grid' ? 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
          {Array.from({ length: itemsPerPage }).map((_, i) => (
            <Card key={i} className="bg-black/40 border-border/50 h-64 animate-pulse" />
          ))}
        </div>
      ) : filteredEntities.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-white/20" />
          <p className="text-lg font-medium mb-2">No entities found</p>
          <p className="text-sm">Try a different search term or category</p>
        </div>
      ) : (
        <>
          {/* Book Page Container with Grid Inside */}
          <div className="relative w-full min-h-[600px] bg-gradient-to-br from-indigo-50/5 via-purple-100/5 to-pink-50/5 rounded-lg border-2 border-indigo-800/30 shadow-2xl overflow-hidden">
            {/* Page Content */}
            <div className="p-8 flex flex-col">
              {/* Page Header */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-indigo-800/20">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-6 w-6 text-indigo-600/60" />
                  <div>
                    <h3 className="text-sm font-semibold text-indigo-900/40 uppercase tracking-wider">
                      Entity Resolution Book
                    </h3>
                    <p className="text-xs text-indigo-700/50 mt-0.5">
                      Page {currentPage} of {totalPages}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-indigo-700/40 font-mono">
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>

              {/* Entity Grid/List */}
              <div className={`flex-1 grid gap-4 mb-6 ${
                viewMode === 'grid' 
                  ? 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' 
                  : 'grid-cols-1'
              }`}>
                {paginatedEntities.map((entity, index) => {
                  try {
                    return (
                      <EntityProfileCard
                        key={entity.entity_id || `entity-${index}`}
                        entity={entity}
                        onClick={() => {
                          setSelectedEntity(entity);
                        }}
                      />
                    );
                  } catch {
                    return null;
                  }
                })}
              </div>

              {/* Page Footer with Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-indigo-800/20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPrevious}
                  disabled={currentPage === 1}
                  className="text-indigo-700/60 hover:text-indigo-600 hover:bg-indigo-500/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {/* Page indicators */}
                  <div className="flex items-center gap-1 px-3 py-1 bg-black/40 rounded-lg border border-indigo-800/30">
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
                              ? 'bg-indigo-600 text-white'
                              : 'text-indigo-700/60 hover:text-indigo-600 hover:bg-indigo-500/10'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-sm text-indigo-700/50">
                    {startIndex + 1}-{Math.min(endIndex, filteredEntities.length)} of {filteredEntities.length}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNext}
                  disabled={currentPage === totalPages}
                  className="text-indigo-700/60 hover:text-indigo-600 hover:bg-indigo-500/10 disabled:opacity-30"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* Book Binding Effect */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-900/40 via-indigo-800/30 to-indigo-900/40" />
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-900/40 via-indigo-800/30 to-indigo-900/40" />
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
                    }
                  }
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedEntity && (
        <EntityDetailModal
          entity={selectedEntity}
          conflicts={conflicts.filter(c => 
            c.entity_a_id === selectedEntity.entity_id || 
            c.entity_b_id === selectedEntity.entity_id
          )}
          onClose={() => {
            setSelectedEntity(null);
            void loadData();
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

