// =====================================================
// SKILLS BOOK
// Purpose: Full-page book component listing all skills
// Enhanced with advanced filters and optimized for large datasets
// =====================================================

import { useState, useEffect, useMemo, useRef } from 'react';
import { Zap, Search, RefreshCw, ChevronLeft, ChevronRight, BookOpen, Filter, X, SlidersHorizontal, TrendingUp, Star, Award, Calendar, Sparkles, Clock, Flame } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { SkillProfileCard } from './SkillProfileCard';
import { SkillDetailModal } from './SkillDetailModal';
import { skillsApi } from '../../api/skills';
import { shouldUseMockData } from '../../hooks/useShouldUseMockData';
import type { Skill, SkillCategory } from '../../types/skill';
import { format, subDays } from 'date-fns';

const ITEMS_PER_PAGE = 12; // Fixed at 12 per page

type SkillCategoryFilter = 'all' | SkillCategory | 'recent' | 'high_level' | 'low_level' | 'active' | 'inactive';
type SortOption = 'name_asc' | 'name_desc' | 'level_desc' | 'level_asc' | 'xp_desc' | 'xp_asc' | 'practice_desc' | 'practice_asc' | 'recent';

// Generate mock skills for demonstration
const generateMockSkills = (): Skill[] => {
  const categories: SkillCategory[] = ['professional', 'creative', 'physical', 'social', 'intellectual', 'emotional', 'practical', 'artistic', 'technical'];
  const skillNames = [
    'Python Programming', 'Guitar Playing', 'Public Speaking', 'Cooking', 'Photography',
    'Running', 'Meditation', 'Writing', 'Drawing', 'Swimming', 'Chess', 'Dancing',
    'Spanish', 'Data Analysis', 'Web Design', 'Yoga', 'Sewing', 'Gardening',
    'Woodworking', 'Singing', 'Piano', 'French', 'Machine Learning', 'Graphic Design'
  ];

  const skills: Skill[] = [];
  const now = Date.now();

  for (let i = 0; i < 30; i++) {
    const daysAgo = Math.floor(Math.random() * 365);
    const firstMentioned = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    const lastPracticed = Math.random() > 0.3 
      ? new Date(now - Math.floor(Math.random() * daysAgo) * 24 * 60 * 60 * 1000)
      : null;
    
    const level = Math.floor(Math.random() * 10) + 1;
    const baseXP = 100 * Math.pow(1.5, level - 1);
    const xpInLevel = Math.random() * (100 * Math.pow(1.5, level) - baseXP);
    const totalXP = baseXP + xpInLevel;
    const nextLevelXP = 100 * Math.pow(1.5, level);
    const xpToNext = nextLevelXP - totalXP;

    skills.push({
      id: `skill-${i}`,
      user_id: 'user',
      skill_name: skillNames[i % skillNames.length] + (i > skillNames.length ? ` ${Math.floor(i / skillNames.length)}` : ''),
      skill_category: categories[Math.floor(Math.random() * categories.length)],
      current_level: level,
      total_xp: Math.floor(totalXP),
      xp_to_next_level: Math.floor(xpToNext),
      description: Math.random() > 0.5 ? `Skill description for ${skillNames[i % skillNames.length]}` : null,
      first_mentioned_at: firstMentioned.toISOString(),
      last_practiced_at: lastPracticed?.toISOString() || null,
      practice_count: Math.floor(Math.random() * 50) + 1,
      auto_detected: Math.random() > 0.3,
      confidence_score: Math.random() * 0.3 + 0.7,
      is_active: Math.random() > 0.2,
      metadata: {},
      created_at: firstMentioned.toISOString(),
      updated_at: lastPracticed?.toISOString() || firstMentioned.toISOString(),
    });
  }

  return skills;
};

const MOCK_SKILLS: Skill[] = generateMockSkills();

export const SkillsBook: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<SkillCategoryFilter>('all');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortOption>('name_asc');
  const [showFilters, setShowFilters] = useState(false);
  const [filterLevelMin, setFilterLevelMin] = useState(1);
  const [filterLevelMax, setFilterLevelMax] = useState(20);
  const [filterConfidenceMin, setFilterConfidenceMin] = useState(0);
  const [filterConfidenceMax, setFilterConfidenceMax] = useState(1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const isMockDataEnabled = shouldUseMockData();

  useEffect(() => {
    void loadSkills();
  }, []);

  const loadSkills = async () => {
    setLoading(true);
    setError(null);

    if (isMockDataEnabled) {
      setSkills(MOCK_SKILLS);
      setLoading(false);
      return;
    }

    try {
      const skillsData = await skillsApi.getSkills({ active_only: false });
      setSkills(skillsData);
    } catch (err: any) {
      console.error('Failed to load skills:', err);
      setSkills([]);
      setError(err.message || 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  };

  // Dynamic categories based on actual skill categories in data
  const availableCategories = useMemo(() => {
    const categoryCounts = new Map<SkillCategoryFilter, number>();
    
    skills.forEach(skill => {
      categoryCounts.set(skill.skill_category, (categoryCounts.get(skill.skill_category) || 0) + 1);
    });

    const categories: SkillCategoryFilter[] = ['all', 'recent', 'high_level', 'low_level', 'active', 'inactive'];
    
    // Add actual skill categories that exist
    const skillCategories: SkillCategory[] = ['professional', 'creative', 'physical', 'social', 'intellectual', 'emotional', 'practical', 'artistic', 'technical', 'other'];
    skillCategories.forEach(cat => {
      if ((categoryCounts.get(cat) || 0) > 0) {
        categories.push(cat);
      }
    });

    return categories;
  }, [skills]);

  const filteredSkills = useMemo(() => {
    let filtered = [...skills];

    // Filter by category
    if (activeCategory !== 'all') {
      filtered = filtered.filter(skill => {
        switch (activeCategory) {
          case 'recent':
            const thirtyDaysAgo = subDays(new Date(), 30);
            return skill.last_practiced_at && new Date(skill.last_practiced_at) >= thirtyDaysAgo;
          case 'high_level':
            return skill.current_level >= 5;
          case 'low_level':
            return skill.current_level <= 3;
          case 'active':
            return skill.is_active;
          case 'inactive':
            return !skill.is_active;
          default:
            return skill.skill_category === activeCategory;
        }
      });
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(skill =>
        skill.skill_name.toLowerCase().includes(term) ||
        skill.description?.toLowerCase().includes(term) ||
        skill.skill_category.toLowerCase().includes(term)
      );
    }

    // Filter by level range
    filtered = filtered.filter(skill =>
      skill.current_level >= filterLevelMin && skill.current_level <= filterLevelMax
    );

    // Filter by confidence range
    filtered = filtered.filter(skill =>
      skill.confidence_score >= filterConfidenceMin && skill.confidence_score <= filterConfidenceMax
    );

    return filtered;
  }, [skills, activeCategory, searchTerm, filterLevelMin, filterLevelMax, filterConfidenceMin, filterConfidenceMax]);

  const sortedSkills = useMemo(() => {
    const sorted = [...filteredSkills];
    
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.skill_name.localeCompare(b.skill_name);
        case 'name_desc':
          return b.skill_name.localeCompare(a.skill_name);
        case 'level_desc':
          return b.current_level - a.current_level;
        case 'level_asc':
          return a.current_level - b.current_level;
        case 'xp_desc':
          return b.total_xp - a.total_xp;
        case 'xp_asc':
          return a.total_xp - b.total_xp;
        case 'practice_desc':
          return b.practice_count - a.practice_count;
        case 'practice_asc':
          return a.practice_count - b.practice_count;
        case 'recent':
          const aDate = a.last_practiced_at ? new Date(a.last_practiced_at).getTime() : 0;
          const bDate = b.last_practiced_at ? new Date(b.last_practiced_at).getTime() : 0;
          return bDate - aDate;
        default:
          return 0;
      }
    });

    return sorted;
  }, [filteredSkills, sortBy]);

  const paginatedSkills = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return sortedSkills.slice(start, end);
  }, [sortedSkills, currentPage]);

  const totalPages = Math.ceil(sortedSkills.length / ITEMS_PER_PAGE);

  // Generate autocomplete suggestions based on search term
  const autocompleteSuggestions = useMemo(() => {
    if (!searchTerm.trim()) {
      // Show recommendations when search is empty
      const recommendations: Array<{ skill: Skill; reason: string; icon: typeof TrendingUp }> = [];
      
      // Most practiced skills
      const mostPracticed = [...skills]
        .sort((a, b) => b.practice_count - a.practice_count)
        .slice(0, 3)
        .map(skill => ({ skill, reason: 'Most practiced', icon: Flame }));
      
      // Highest level skills
      const highestLevel = [...skills]
        .sort((a, b) => b.current_level - a.current_level)
        .slice(0, 3)
        .map(skill => ({ skill, reason: 'Highest level', icon: TrendingUp }));
      
      // Recently practiced
      const recentlyPracticed = [...skills]
        .filter(s => s.last_practiced_at)
        .sort((a, b) => {
          const aDate = new Date(a.last_practiced_at!).getTime();
          const bDate = new Date(b.last_practiced_at!).getTime();
          return bDate - aDate;
        })
        .slice(0, 3)
        .map(skill => ({ skill, reason: 'Recently practiced', icon: Clock }));
      
      // Combine and deduplicate
      const allRecs = [...mostPracticed, ...highestLevel, ...recentlyPracticed];
      const seen = new Set<string>();
      for (const rec of allRecs) {
        if (!seen.has(rec.skill.id) && recommendations.length < 6) {
          recommendations.push(rec);
          seen.add(rec.skill.id);
        }
      }
      
      return recommendations;
    }

    // Show matching skills as you type
    const term = searchTerm.toLowerCase();
    const matches = skills
      .filter(skill =>
        skill.skill_name.toLowerCase().includes(term) ||
        skill.description?.toLowerCase().includes(term) ||
        skill.skill_category.toLowerCase().includes(term)
      )
      .slice(0, 8)
      .map(skill => ({ skill, reason: 'Match', icon: Search as typeof TrendingUp }));

    return matches;
  }, [searchTerm, skills]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchInputRef.current &&
        suggestionsRef.current &&
        !searchInputRef.current.contains(event.target as Node) &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation for suggestions
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (autocompleteSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowSuggestions(true);
      setSelectedSuggestionIndex(prev =>
        prev < autocompleteSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      const selected = autocompleteSuggestions[selectedSuggestionIndex];
      if (selected) {
        setSearchTerm(selected.skill.skill_name);
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        handleSkillClick(selected.skill);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  const handleSkillClick = (skill: Skill) => {
    setSelectedSkill(skill);
    setShowSuggestions(false);
  };

  const handleCloseModal = () => {
    setSelectedSkill(null);
    void loadSkills(); // Refresh skills after modal closes
  };

  const handleSuggestionClick = (suggestion: { skill: Skill; reason: string; icon: typeof TrendingUp }) => {
    if (searchTerm.trim()) {
      setSearchTerm(suggestion.skill.skill_name);
    }
    setShowSuggestions(false);
    handleSkillClick(suggestion.skill);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-white/60">Loading skills...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-white">Skills Book</h1>
              <p className="text-white/60">
                {sortedSkills.length} skill{sortedSkills.length !== 1 ? 's' : ''} found
              </p>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <Card className="bg-black/40 border-white/10">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <div className="relative">
                <div className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-white/40" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Search skills or browse recommendations..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                      setShowSuggestions(true);
                      setSelectedSuggestionIndex(-1);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={handleSearchKeyDown}
                    className="bg-black/40 border-white/20 text-white text-sm sm:text-base"
                  />
                  {searchTerm && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchTerm('');
                        setShowSuggestions(false);
                        setCurrentPage(1);
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Autocomplete Suggestions Dropdown — mobile responsive: full width, touch-friendly items, scrollable */}
                {showSuggestions && autocompleteSuggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute top-full left-0 right-0 mt-2 w-full min-w-0 bg-black/95 border border-white/20 rounded-lg shadow-xl z-50 max-h-[60vh] sm:max-h-96 overflow-y-auto overflow-x-hidden"
                  >
                    {!searchTerm.trim() && (
                      <div className="px-3 sm:px-4 py-2 border-b border-white/10">
                        <div className="flex items-center gap-2 text-xs text-white/60">
                          <Sparkles className="h-3 w-3 flex-shrink-0" />
                          <span>Recommendations</span>
                        </div>
                      </div>
                    )}
                    <div className="py-1 sm:py-2">
                      {autocompleteSuggestions.map((suggestion, index) => {
                        const Icon = suggestion.icon;
                        const isSelected = index === selectedSuggestionIndex;
                        return (
                          <button
                            key={suggestion.skill.id}
                            type="button"
                            onClick={() => handleSuggestionClick(suggestion)}
                            className={`w-full px-3 sm:px-4 py-3 text-left hover:bg-white/10 transition-colors min-h-[44px] sm:min-h-0 ${
                              isSelected ? 'bg-primary/20 border-l-2 border-primary' : ''
                            }`}
                            onMouseEnter={() => setSelectedSuggestionIndex(index)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                                  <span className="font-semibold text-white truncate">
                                    {suggestion.skill.skill_name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-white/60">
                                  <Badge variant="outline" className="text-xs border-white/20 text-white/70 capitalize">
                                    {suggestion.skill.skill_category}
                                  </Badge>
                                  <span>Level {suggestion.skill.current_level}</span>
                                  <span>•</span>
                                  <span>{suggestion.skill.total_xp.toLocaleString()} XP</span>
                                </div>
                                {suggestion.reason !== 'Match' && (
                                  <div className="text-xs text-primary/70 mt-1">
                                    {suggestion.reason}
                                  </div>
                                )}
                              </div>
                              <div className="flex-shrink-0">
                                <Zap className="h-4 w-4 text-white/40" />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {!searchTerm.trim() && (
                      <div className="px-4 py-2 border-t border-white/10">
                        <div className="text-xs text-white/40 italic">
                          Start typing to search, or click a recommendation to view details
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {showFilters && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/10">
                  <div>
                    <label className="text-xs text-white/60 mb-1 block">Level Range</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="20"
                        value={filterLevelMin}
                        onChange={(e) => setFilterLevelMin(parseInt(e.target.value) || 1)}
                        className="bg-black/40 border-white/20 text-white"
                      />
                      <span className="text-white/40">-</span>
                      <Input
                        type="number"
                        min="1"
                        max="20"
                        value={filterLevelMax}
                        onChange={(e) => setFilterLevelMax(parseInt(e.target.value) || 20)}
                        className="bg-black/40 border-white/20 text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 mb-1 block">Confidence Range</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        value={filterConfidenceMin}
                        onChange={(e) => setFilterConfidenceMin(parseFloat(e.target.value) || 0)}
                        className="bg-black/40 border-white/20 text-white"
                      />
                      <span className="text-white/40">-</span>
                      <Input
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        value={filterConfidenceMax}
                        onChange={(e) => setFilterConfidenceMax(parseFloat(e.target.value) || 1)}
                        className="bg-black/40 border-white/20 text-white"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Category Tabs */}
        <Tabs value={activeCategory} onValueChange={(v) => {
          setActiveCategory(v as SkillCategoryFilter);
          setCurrentPage(1);
        }}>
          <TabsList className="bg-black/40 border-white/10 p-1 h-auto flex flex-wrap gap-1">
            {availableCategories.map(category => (
              <TabsTrigger
                key={category}
                value={category}
                className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs sm:text-sm flex-shrink-0"
              >
                {category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* View Controls */}
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as SortOption);
                setCurrentPage(1);
              }}
              className="bg-black/40 border border-white/20 text-white rounded px-3 py-1 text-sm"
            >
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="level_desc">Level (High-Low)</option>
              <option value="level_asc">Level (Low-High)</option>
              <option value="xp_desc">XP (High-Low)</option>
              <option value="xp_asc">XP (Low-High)</option>
              <option value="practice_desc">Practice (High-Low)</option>
              <option value="practice_asc">Practice (Low-High)</option>
              <option value="recent">Recently Practiced</option>
            </select>
          </div>
        </div>

        {/* Skills Grid/List */}
        {error && (
          <Card className="bg-red-500/10 border-red-500/30">
            <CardContent className="p-4">
              <p className="text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {paginatedSkills.length === 0 ? (
          <Card className="bg-black/40 border-white/10">
            <CardContent className="p-8 sm:p-12 text-center">
              <Zap className="h-10 w-10 sm:h-12 sm:w-12 text-white/20 mx-auto mb-3 sm:mb-4" />
              <p className="text-xs sm:text-sm text-white/60">No skills found matching your filters.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-2 gap-2 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paginatedSkills.map(skill => (
              <SkillProfileCard
                key={skill.id}
                skill={skill}
                onClick={() => handleSkillClick(skill)}
                showProgress={true}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
            <p className="text-white/60 text-xs sm:text-sm">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, sortedSkills.length)} of {sortedSkills.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="border-white/20 text-xs sm:text-sm"
              >
                <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                Previous
              </Button>
              <span className="text-white/60 text-xs sm:text-sm">
                Page {currentPage}/{totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="border-white/20 text-xs sm:text-sm"
              >
                Next
                <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Skill Detail Modal */}
        {selectedSkill && (
          <SkillDetailModal
            skill={selectedSkill}
            onClose={handleCloseModal}
            onUpdate={loadSkills}
          />
        )}
      </div>
    </div>
  );
};

