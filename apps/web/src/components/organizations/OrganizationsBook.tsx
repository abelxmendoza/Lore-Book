// =====================================================
// ORGANIZATIONS BOOK
// Purpose: Full-page book component listing all organizations
// Enhanced with advanced filters and optimized for large datasets
// =====================================================

import { useState, useEffect, useMemo } from 'react';
import { Building2, Search, RefreshCw, ChevronLeft, ChevronRight, BookOpen, Filter, X, Grid3x3, List, SlidersHorizontal, TrendingUp, Users, MapPin, Calendar, Hash, Sparkles } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { OrganizationProfileCard, type Organization, type OrganizationMember, type OrganizationStory, type OrganizationEvent, type OrganizationLocation } from './OrganizationProfileCard';
import { OrganizationDetailModal } from './OrganizationDetailModal';
import { fetchJson } from '../../lib/api';
import { shouldUseMockData } from '../../hooks/useShouldUseMockData';
import { ColorCodedTimeline } from '../timeline/ColorCodedTimeline';
import { useLoreKeeper } from '../../hooks/useLoreKeeper';
import { format, subDays } from 'date-fns';

const ITEMS_PER_PAGE = 24;
const ITEMS_PER_PAGE_OPTIONS = [12, 24, 48, 96];

type OrganizationCategory = 'all' | 'friend_groups' | 'companies' | 'sports_teams' | 'clubs' | 'nonprofits' | 'affiliations' | 'recent';
type SortOption = 'name_asc' | 'name_desc' | 'usage_desc' | 'usage_asc' | 'confidence_desc' | 'confidence_asc' | 'recent' | 'importance_desc' | 'involvement_desc' | 'priority_desc' | 'value_desc';
type ViewMode = 'grid' | 'list';

// Generate comprehensive mock organizations data with rich metadata
const generateMockOrganizations = (): Organization[] => {
  const now = new Date();
  
  // Friend Groups
  const friendGroups = [
    { name: 'College Squad', members: ['Sarah Chen', 'Marcus Johnson', 'Alex Rivera', 'Jordan Kim'] },
    { name: 'Weekend Warriors', members: ['Emma Wilson', 'Chris Taylor', 'Sam Martinez'] },
    { name: 'Gaming Crew', members: ['Mike Chen', 'Lisa Park', 'David Lee', 'Anna Brown'] },
  ];

  // Companies
  const companies = [
    { name: 'Tech Corp', members: ['Sarah Chen', 'Marcus Johnson', 'Alex Rivera'] },
    { name: 'Design Studio', members: ['Emma Wilson', 'Chris Taylor'] },
    { name: 'Startup Inc', members: ['Jordan Kim', 'Sam Martinez'] },
  ];

  // Sports Teams
  const sportsTeams = [
    { name: 'Basketball Team', members: ['Mike Chen', 'David Lee', 'Chris Taylor', 'Sam Martinez'] },
    { name: 'Running Club', members: ['Sarah Chen', 'Emma Wilson', 'Anna Brown'] },
    { name: 'Soccer Squad', members: ['Marcus Johnson', 'Alex Rivera', 'Jordan Kim'] },
  ];

  // Clubs
  const clubs = [
    { name: 'Book Club', members: ['Sarah Chen', 'Lisa Park', 'Emma Wilson'] },
    { name: 'Photography Club', members: ['Alex Rivera', 'Chris Taylor', 'Anna Brown'] },
    { name: 'Cooking Club', members: ['Marcus Johnson', 'Jordan Kim', 'David Lee'] },
  ];

  // Nonprofits
  const nonprofits = [
    { name: 'Community Foundation', members: ['Sarah Chen', 'Emma Wilson'] },
    { name: 'Environmental Group', members: ['Alex Rivera', 'Chris Taylor', 'Sam Martinez'] },
  ];

  // Affiliations
  const affiliations = [
    { name: 'Alumni Association', members: ['Sarah Chen', 'Marcus Johnson', 'Alex Rivera', 'Jordan Kim'] },
    { name: 'Professional Network', members: ['Emma Wilson', 'Chris Taylor', 'David Lee'] },
  ];

  const allOrgs = [
    ...friendGroups.map(g => ({ ...g, type: 'friend_group' as const })),
    ...companies.map(c => ({ ...c, type: 'company' as const })),
    ...sportsTeams.map(t => ({ ...t, type: 'sports_team' as const })),
    ...clubs.map(c => ({ ...c, type: 'club' as const })),
    ...nonprofits.map(n => ({ ...n, type: 'nonprofit' as const })),
    ...affiliations.map(a => ({ ...a, type: 'affiliation' as const })),
  ];

  const organizations: Organization[] = allOrgs.map((item, index) => {
    const daysAgo = Math.floor(Math.random() * 90);
    const lastSeen = subDays(now, daysAgo);
    const usageCount = Math.floor(Math.random() * 50) + 1;
    const confidence = Math.random() * 0.4 + 0.6;
    const memberCount = item.members.length;
    const locations = ['San Francisco', 'New York', 'Remote', 'Los Angeles', 'Chicago', 'Boston', 'Seattle'];

    // Generate members
    const members: OrganizationMember[] = item.members.map((name, i) => ({
      id: `member-${index}-${i}`,
      character_name: name,
      role: item.type === 'company' ? (i === 0 ? 'Founder' : 'Member') :
            item.type === 'sports_team' ? (i === 0 ? 'Captain' : 'Player') :
            item.type === 'club' ? (i === 0 ? 'President' : 'Member') :
            'Member',
      status: 'active' as const,
    }));

    // Generate stories (2-4 per org)
    const storyCount = Math.floor(Math.random() * 3) + 2;
    const stories: OrganizationStory[] = Array.from({ length: storyCount }, (_, i) => ({
      id: `story-${index}-${i}`,
      title: `${item.name} Story ${i + 1}`,
      summary: `A memorable moment with ${item.name}. We had a great time together.`,
      date: subDays(now, Math.floor(Math.random() * 60)).toISOString(),
      related_members: [item.members[Math.floor(Math.random() * item.members.length)]],
    }));

    // Generate events (1-3 per org)
    const eventCount = Math.floor(Math.random() * 3) + 1;
    const events: OrganizationEvent[] = Array.from({ length: eventCount }, (_, i) => ({
      id: `event-${index}-${i}`,
      title: item.type === 'sports_team' ? 'Game' : item.type === 'company' ? 'Meeting' : 'Gathering',
      date: subDays(now, Math.floor(Math.random() * 30)).toISOString(),
      type: item.type === 'sports_team' ? 'game' : item.type === 'company' ? 'meeting' : 'social',
    }));

    // Generate locations (1-2 per org)
    const locationCount = Math.floor(Math.random() * 2) + 1;
    const locations_list: OrganizationLocation[] = Array.from({ length: locationCount }, (_, i) => ({
      id: `location-${index}-${i}`,
      location_name: locations[(index + i) % locations.length],
      visit_count: Math.floor(Math.random() * 20) + 1,
      last_visited: subDays(now, Math.floor(Math.random() * 30)).toISOString(),
    }));

    return {
      id: `mock-org-${index + 1}`,
      name: item.name,
      aliases: [
        item.name.split(' ')[0],
        item.name.split(' ').slice(0, 2).join(' '),
        item.name.replace(/\s+/g, '')
      ].filter(Boolean),
      type: item.type,
      description: item.type === 'friend_group' ? `My close group of friends. We've been together since ${2020 + Math.floor(Math.random() * 4)}.` :
                    item.type === 'company' ? `A company I work with professionally.` :
                    item.type === 'sports_team' ? `A sports team I'm part of. We practice regularly and compete together.` :
                    item.type === 'club' ? `A club I'm involved with. We meet regularly to share our interests.` :
                    item.type === 'nonprofit' ? `A nonprofit organization I volunteer with.` :
                    `An organization I'm affiliated with.`,
      location: locations[index % locations.length],
      founded_date: subDays(now, Math.floor(Math.random() * 365 * 3)).toISOString().split('T')[0],
      status: 'active' as const,
      members,
      stories,
      events,
      locations: locations_list,
      member_count: memberCount,
      confidence,
      usage_count: usageCount,
      last_seen: lastSeen.toISOString(),
      created_at: subDays(now, daysAgo + 30).toISOString(),
      updated_at: lastSeen.toISOString(),
      metadata: {},
      // Mock analytics
      analytics: {
        user_involvement_score: Math.floor(Math.random() * 40) + 60, // 60-100
        user_ranking: Math.floor(Math.random() * 3) + 1, // 1-3
        user_role_importance: Math.floor(Math.random() * 30) + 50, // 50-80
        relevance_score: Math.floor(Math.random() * 40) + 50, // 50-90
        priority_score: Math.floor(Math.random() * 30) + 60, // 60-90
        importance_score: Math.floor(Math.random() * 30) + 60, // 60-90
        value_score: Math.floor(Math.random() * 40) + 50, // 50-90
        group_influence_on_user: Math.floor(Math.random() * 30) + 40, // 40-70
        user_influence_over_group: Math.floor(Math.random() * 40) + 30, // 30-70
        cohesion_score: Math.floor(Math.random() * 40) + 50, // 50-90
        activity_level: Math.floor(Math.random() * 40) + 50, // 50-90
        engagement_score: Math.floor(Math.random() * 30) + 60, // 60-90
        recency_score: Math.max(0, 100 - daysAgo * 2), // Based on days ago
        frequency_score: Math.min(100, (usageCount / 50) * 100), // Based on usage
        trend: daysAgo < 7 ? 'increasing' : daysAgo < 30 ? 'stable' : 'decreasing',
        strengths: item.type === 'friend_group' ? ['Strong personal connections', 'Regular interactions'] :
                   item.type === 'company' ? ['Professional network', 'Career growth'] :
                   item.type === 'sports_team' ? ['Active participation', 'Team spirit'] :
                   ['Shared interests', 'Regular meetings'],
        weaknesses: memberCount < 3 ? ['Small member base'] : [],
        opportunities: ['Potential for increased engagement'],
        threats: [],
      }
    };
  });

  return organizations;
};

const MOCK_ORGANIZATIONS: Organization[] = generateMockOrganizations();

export const OrganizationsBook: React.FC = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<OrganizationCategory>('all');
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(ITEMS_PER_PAGE);
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterConfidenceMin, setFilterConfidenceMin] = useState(0);
  const [filterConfidenceMax, setFilterConfidenceMax] = useState(1);
  const [filterUsageMin, setFilterUsageMin] = useState(0);
  const [filterUsageMax, setFilterUsageMax] = useState(100);
  const isMockDataEnabled = shouldUseMockData();
  const { entries = [], chapters = [] } = useLoreKeeper();

  useEffect(() => {
    void loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    setLoading(true);
    setError(null);

    if (isMockDataEnabled) {
      setOrganizations(MOCK_ORGANIZATIONS);
      setLoading(false);
      return;
    }

    try {
      // Fetch organizations from entity resolution API (filtered for ORG type)
      const result = await fetchJson<{ success: boolean; entities: any[] }>(
        '/api/entity-resolution/entities?include_secondary=false&include_tertiary=false'
      );
      
      if (result.success && result.entities) {
        // Filter for ORG type and transform to Organization format
        const orgs = result.entities
          .filter(e => e.entity_type === 'ORG')
          .map(e => ({
            id: e.entity_id,
            name: e.primary_name,
            aliases: e.aliases || [],
            type: 'organization',
            description: undefined,
            location: undefined,
            member_count: undefined,
            related_people: [],
            confidence: e.confidence,
            usage_count: e.usage_count,
            last_seen: e.last_seen,
            created_at: e.last_seen,
            updated_at: e.last_seen,
            metadata: {}
          }));
        setOrganizations(orgs);
      } else {
        setOrganizations([]);
      }
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
      setOrganizations([]);
      setError(err.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  // Dynamic categories based on actual organization types in data
  const availableCategories = useMemo(() => {
    const typeCounts = new Map<OrganizationCategory, number>();
    
    organizations.forEach(org => {
      switch (org.type) {
        case 'friend_group':
          typeCounts.set('friend_groups', (typeCounts.get('friend_groups') || 0) + 1);
          break;
        case 'company':
          typeCounts.set('companies', (typeCounts.get('companies') || 0) + 1);
          break;
        case 'sports_team':
          typeCounts.set('sports_teams', (typeCounts.get('sports_teams') || 0) + 1);
          break;
        case 'club':
          typeCounts.set('clubs', (typeCounts.get('clubs') || 0) + 1);
          break;
        case 'nonprofit':
          typeCounts.set('nonprofits', (typeCounts.get('nonprofits') || 0) + 1);
          break;
        case 'affiliation':
          typeCounts.set('affiliations', (typeCounts.get('affiliations') || 0) + 1);
          break;
      }
    });

    // Only include categories that have at least one organization
    const categories: OrganizationCategory[] = ['all', 'recent'];
    
    if (typeCounts.get('friend_groups') || 0 > 0) categories.push('friend_groups');
    if (typeCounts.get('companies') || 0 > 0) categories.push('companies');
    if (typeCounts.get('sports_teams') || 0 > 0) categories.push('sports_teams');
    if (typeCounts.get('clubs') || 0 > 0) categories.push('clubs');
    if (typeCounts.get('nonprofits') || 0 > 0) categories.push('nonprofits');
    if (typeCounts.get('affiliations') || 0 > 0) categories.push('affiliations');

    return categories;
  }, [organizations]);

  const uniqueTypes = useMemo(() => {
    const types = new Set(organizations.map(o => o.type).filter(Boolean));
    return Array.from(types).sort();
  }, [organizations]);

  const filteredOrganizations = useMemo(() => {
    let filtered = [...organizations];

    // Filter by category
    if (activeCategory !== 'all') {
      filtered = filtered.filter(org => {
        switch (activeCategory) {
          case 'friend_groups':
            return org.type === 'friend_group';
          case 'companies':
            return org.type === 'company';
          case 'sports_teams':
            return org.type === 'sports_team';
          case 'clubs':
            return org.type === 'club';
          case 'nonprofits':
            return org.type === 'nonprofit';
          case 'affiliations':
            return org.type === 'affiliation';
          case 'recent':
            const thirtyDaysAgo = subDays(new Date(), 30);
            return new Date(org.last_seen) >= thirtyDaysAgo;
          default:
            return true;
        }
      });
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (org) =>
          org.name.toLowerCase().includes(term) ||
          org.aliases.some(alias => alias.toLowerCase().includes(term)) ||
          (org.description && org.description.toLowerCase().includes(term)) ||
          (org.type && org.type.toLowerCase().includes(term))
      );
    }

    // Advanced filters
    if (filterTypes.length > 0) {
      filtered = filtered.filter(org => org.type && filterTypes.includes(org.type));
    }

    filtered = filtered.filter(org => 
      org.confidence >= filterConfidenceMin && 
      org.confidence <= filterConfidenceMax
    );

    filtered = filtered.filter(org => 
      org.usage_count >= filterUsageMin && 
      org.usage_count <= filterUsageMax
    );

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'importance_desc':
          const importanceA = a.analytics?.importance_score || 0;
          const importanceB = b.analytics?.importance_score || 0;
          if (importanceB !== importanceA) return importanceB - importanceA;
          return b.usage_count - a.usage_count; // Tie-breaker
        case 'involvement_desc':
          const involvementA = a.analytics?.user_involvement_score || 0;
          const involvementB = b.analytics?.user_involvement_score || 0;
          if (involvementB !== involvementA) return involvementB - involvementA;
          return b.usage_count - a.usage_count;
        case 'priority_desc':
          const priorityA = a.analytics?.priority_score || 0;
          const priorityB = b.analytics?.priority_score || 0;
          if (priorityB !== priorityA) return priorityB - priorityA;
          return b.usage_count - a.usage_count;
        case 'value_desc':
          const valueA = a.analytics?.value_score || 0;
          const valueB = b.analytics?.value_score || 0;
          if (valueB !== valueA) return valueB - valueA;
          return b.usage_count - a.usage_count;
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'usage_desc':
          return b.usage_count - a.usage_count;
        case 'usage_asc':
          return a.usage_count - b.usage_count;
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
  }, [organizations, searchTerm, activeCategory, filterTypes, filterConfidenceMin, filterConfidenceMax, filterUsageMin, filterUsageMax, sortBy]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterTypes.length > 0) count++;
    if (filterConfidenceMin > 0 || filterConfidenceMax < 1) count++;
    if (filterUsageMin > 0 || filterUsageMax < 100) count++;
    return count;
  }, [filterTypes, filterConfidenceMin, filterConfidenceMax, filterUsageMin, filterUsageMax]);

  const clearFilters = () => {
    setFilterTypes([]);
    setFilterConfidenceMin(0);
    setFilterConfidenceMax(1);
    setFilterUsageMin(0);
    setFilterUsageMax(100);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeCategory, filterTypes, filterConfidenceMin, filterConfidenceMax, filterUsageMin, filterUsageMax, sortBy]);

  const totalPages = Math.ceil(filteredOrganizations.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrganizations = filteredOrganizations.slice(startIndex, endIndex);

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

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-400 mb-4">
              <Building2 className="w-5 h-5" />
              <p className="text-sm">{error}</p>
            </div>
            <Button onClick={() => void loadOrganizations()} variant="outline" size="sm">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Controls */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              type="text"
              placeholder="Search organizations by name, alias, or type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
              <option value="importance_desc">Most Important</option>
              <option value="involvement_desc">Most Involved</option>
              <option value="priority_desc">Highest Priority</option>
              <option value="value_desc">Highest Value</option>
              <option value="name_asc">Name A-Z</option>
              <option value="name_desc">Name Z-A</option>
              <option value="usage_desc">Most Mentioned</option>
              <option value="usage_asc">Least Mentioned</option>
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
              onClick={() => void loadOrganizations()}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Category Tabs - Dynamically generated based on available types */}
        <Tabs value={activeCategory} onValueChange={(value) => setActiveCategory(value as OrganizationCategory)}>
          <TabsList className="w-full bg-black/40 border border-border/50 p-1 h-auto">
            {availableCategories.includes('all') && (
              <TabsTrigger 
                value="all" 
                className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
              >
                <Hash className="h-4 w-4" />
                All
              </TabsTrigger>
            )}
            {availableCategories.includes('friend_groups') && (
              <TabsTrigger 
                value="friend_groups" 
                className="flex items-center gap-2 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400"
              >
                <Users className="h-4 w-4" />
                Friend Groups
              </TabsTrigger>
            )}
            {availableCategories.includes('companies') && (
              <TabsTrigger 
                value="companies" 
                className="flex items-center gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400"
              >
                <Building2 className="h-4 w-4" />
                Companies
              </TabsTrigger>
            )}
            {availableCategories.includes('sports_teams') && (
              <TabsTrigger 
                value="sports_teams" 
                className="flex items-center gap-2 data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400"
              >
                <Users className="h-4 w-4" />
                Sports Teams
              </TabsTrigger>
            )}
            {availableCategories.includes('clubs') && (
              <TabsTrigger 
                value="clubs" 
                className="flex items-center gap-2 data-[state=active]:bg-yellow-500/20 data-[state=active]:text-yellow-400"
              >
                <Users className="h-4 w-4" />
                Clubs
              </TabsTrigger>
            )}
            {availableCategories.includes('nonprofits') && (
              <TabsTrigger 
                value="nonprofits" 
                className="flex items-center gap-2 data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-400"
              >
                <Building2 className="h-4 w-4" />
                Nonprofits
              </TabsTrigger>
            )}
            {availableCategories.includes('affiliations') && (
              <TabsTrigger 
                value="affiliations" 
                className="flex items-center gap-2 data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
              >
                <Building2 className="h-4 w-4" />
                Affiliations
              </TabsTrigger>
            )}
            {availableCategories.includes('recent') && (
              <TabsTrigger 
                value="recent" 
                className="flex items-center gap-2 data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
              >
                <Calendar className="h-4 w-4" />
                Recent
              </TabsTrigger>
            )}
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
                      Mentions: {filterUsageMin}-{filterUsageMax}
                      <button
                        onClick={() => { setFilterUsageMin(0); setFilterUsageMax(100); }}
                        className="ml-2 hover:text-primary/70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Organization Type Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    Organization Type
                  </label>
                  <div className="max-h-40 overflow-y-auto p-2 bg-black/40 rounded-lg border border-border/30 space-y-2">
                    {uniqueTypes.length === 0 ? (
                      <p className="text-xs text-white/40 text-center py-2">No types available</p>
                    ) : (
                      uniqueTypes.map(type => (
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
                    <div className="flex items-center gap-2 text-xs text-white/50">
                      <span className="flex-1 text-left">Low</span>
                      <span className="flex-1 text-center">Medium</span>
                      <span className="flex-1 text-right">High</span>
                    </div>
                  </div>
                </div>

                {/* Usage Count */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white flex items-center gap-2">
                    <Hash className="h-4 w-4 text-primary" />
                    Mention Count
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
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Summary */}
        <div className="flex items-center justify-between text-sm text-white/60">
          <div>
            Showing {startIndex + 1}-{Math.min(endIndex, filteredOrganizations.length)} of {filteredOrganizations.length} organizations
            {filteredOrganizations.length !== organizations.length && (
              <span className="ml-2 text-primary">({organizations.length} total)</span>
            )}
          </div>
        </div>
      </div>

      {/* Organizations Display */}
      {loading ? (
        <div className={`grid gap-4 ${viewMode === 'grid' ? 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
          {Array.from({ length: itemsPerPage }).map((_, i) => (
            <Card key={i} className="bg-black/40 border-border/50 h-64 animate-pulse" />
          ))}
        </div>
      ) : filteredOrganizations.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-white/20" />
          <p className="text-lg font-medium mb-2">No organizations found</p>
          <p className="text-sm">Try adjusting your filters or search term</p>
        </div>
      ) : (
        <>
          {/* Book Page Container */}
          <div className="relative w-full min-h-[600px] bg-gradient-to-br from-purple-50/5 via-purple-100/5 to-purple-50/5 rounded-lg border-2 border-purple-800/30 shadow-2xl overflow-hidden">
            <div className="p-8 flex flex-col">
              {/* Page Header */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-purple-800/20">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-6 w-6 text-purple-600/60" />
                  <div>
                    <h3 className="text-sm font-semibold text-purple-900/40 uppercase tracking-wider">
                      Organizations Book
                    </h3>
                    <p className="text-xs text-purple-700/50 mt-0.5">
                      Page {currentPage} of {totalPages} · {filteredOrganizations.length} organizations
                    </p>
                  </div>
                </div>
                <div className="text-xs text-purple-700/40 font-mono">
                  {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>

              {/* Organizations Grid/List */}
              <div className={`flex-1 grid gap-4 mb-6 ${
                viewMode === 'grid' 
                  ? 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' 
                  : 'grid-cols-1'
              }`}>
                {paginatedOrganizations.map((org) => (
                  <OrganizationProfileCard
                    key={org.id}
                    organization={org}
                    onClick={() => setSelectedOrganization(org)}
                  />
                ))}
              </div>

              {/* Page Footer with Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-purple-800/20">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToPrevious}
                  disabled={currentPage === 1}
                  className="text-purple-700/60 hover:text-purple-600 hover:bg-purple-500/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 px-3 py-1 bg-black/40 rounded-lg border border-purple-800/30">
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
                              ? 'bg-purple-600 text-white'
                              : 'text-purple-700/60 hover:text-purple-600 hover:bg-purple-500/10'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-sm text-purple-700/50">
                    {startIndex + 1}-{Math.min(endIndex, filteredOrganizations.length)} of {filteredOrganizations.length}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goToNext}
                  disabled={currentPage === totalPages}
                  className="text-purple-700/60 hover:text-purple-600 hover:bg-purple-500/10 disabled:opacity-30"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* Book Binding Effect */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-900/40 via-purple-800/30 to-purple-900/40" />
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-900/40 via-purple-800/30 to-purple-900/40" />
          </div>
        </>
      )}

      {/* Timeline at bottom */}
      {filteredOrganizations.length > 0 && (
        <div className="mt-8">
          <ColorCodedTimeline />
        </div>
      )}

      {/* Organization Detail Modal */}
      {selectedOrganization && (
        <OrganizationDetailModal
          organization={selectedOrganization}
          onClose={() => setSelectedOrganization(null)}
          onUpdate={() => {
            void loadOrganizations();
            setSelectedOrganization(null);
          }}
        />
      )}
    </div>
  );
};

