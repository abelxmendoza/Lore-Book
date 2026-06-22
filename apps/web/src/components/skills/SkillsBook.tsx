// =====================================================
// SKILLS BOOK
// Purpose: Full-page book component listing all skills
// Enhanced with advanced filters and optimized for large datasets
// =====================================================

import { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, BookOpen, SlidersHorizontal } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SkillProfileCard } from './SkillProfileCard';
import { SkillDetailModal } from './SkillDetailModal';
import { DetectedSkillSuggestions } from './DetectedSkillSuggestions';
import { SearchWithAutocomplete } from '../ui/SearchWithAutocomplete';
import { useSkillsBookData } from '../../store/hooks/useEntityBooks';
import type { Skill, SkillCategory } from '../../types/skill';
import { readSkillProfile } from '../../lib/skillProfile';
import { skillCategoryTheme, skillFilterChipActive } from '../../lib/skillCategoryTheme';
import { epistemicFieldLabel } from '../../lib/epistemicLabels';
import { cn } from '../../lib/cn';
import { fetchSkillById } from '../../lib/hydrateBookEntity';
import { consumeHighlightItemId, resolveBookHighlightItem } from '../../lib/resolveBookHighlight';
import { subDays } from 'date-fns';
import { BookTrustSummary } from '../trust/BookTrustSummary';
import { mockDataService } from '../../services/mockDataService';
import { skillBookDemoSkills } from '../../mocks/skillBookDemo';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  setSearchTerm,
  setActiveCategory,
  setSortBy,
  goToNextPage,
  goToPrevPage,
  clampCurrentPage,
  toggleAdvancedFilters,
  setFilterLevelMin,
  setFilterLevelMax,
  setFilterConfidenceMin,
  setFilterConfidenceMax,
  setFilterProficiencyMin,
  type SkillCategoryFilter,
  type SkillSortOption,
} from '../../store/slices/skillsBookSlice';
import {
  selectSkillsBookSearchTerm,
  selectSkillsBookActiveCategory,
  selectSkillsBookSortBy,
  selectSkillsBookCurrentPage,
  selectSkillsBookShowAdvancedFilters,
  selectSkillsBookNumericFilters,
} from '../../store/selectors';

/** Match Places book — 2 columns × 6 rows on mobile */
const ITEMS_PER_PAGE = 12;

function skillMatchesCategory(skill: Skill, category: SkillCategoryFilter): boolean {
  const profile = readSkillProfile(skill.metadata);
  switch (category) {
    case 'all':
      return true;
    case 'recent': {
      const thirtyDaysAgo = subDays(new Date(), 30);
      return Boolean(skill.last_practiced_at && new Date(skill.last_practiced_at) >= thirtyDaysAgo);
    }
    case 'high_level':
      return skill.current_level >= 5;
    case 'low_level':
      return skill.current_level <= 3;
    case 'active':
      return skill.is_active;
    case 'inactive':
      return !skill.is_active;
    case 'auto_detected':
      return skill.auto_detected;
    case 'paid':
      return profile?.monetization === 'paid' || profile?.monetization === 'potentially_paid';
    case 'hobby':
      return profile?.monetization === 'hobby_only' || profile?.skill_type === 'hobby';
    case 'improving':
      return profile?.trajectory === 'improving';
    case 'high_proficiency':
      return (profile?.proficiency ?? 0) >= 70;
    case 'physical_type':
      return profile?.skill_type === 'physical' || skill.skill_category === 'physical';
    case 'technical_type':
      return profile?.skill_type === 'technical' || skill.skill_category === 'technical';
    default:
      return skill.skill_category === category;
  }
}

const CATEGORY_LABELS: Partial<Record<SkillCategoryFilter, string>> = {
  all: 'All',
  recent: 'Recent',
  active: 'Active',
  inactive: 'Inactive',
  auto_detected: 'Auto',
  paid: 'Paid',
  hobby: 'Hobby',
  improving: 'Growing',
  high_proficiency: '70%+',
  high_level: 'High Lv',
  low_level: 'Low Lv',
  physical_type: 'Physical',
  technical_type: 'Technical',
  professional: 'Pro',
  creative: 'Creative',
  physical: 'Physical',
  social: 'Social',
  intellectual: 'Intel',
  emotional: 'Emotion',
  practical: 'Practical',
  artistic: 'Art',
  technical: 'Tech',
  other: 'Other',
};

function formatCategoryLabel(category: SkillCategoryFilter): string {
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category]!;
  return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

const SORT_LABELS: Record<SkillSortOption, string> = {
  name_asc: 'A–Z',
  name_desc: 'Z–A',
  level_desc: 'Level ↓',
  level_asc: 'Level ↑',
  xp_desc: 'XP ↓',
  xp_asc: 'XP ↑',
  practice_desc: 'Practice ↓',
  practice_asc: 'Practice ↑',
  recent: 'Recent',
};


export const SkillsBook: React.FC = () => {
  const { data, loading, refetch, isMockEnabled: isMockDataEnabled } = useSkillsBookData();
  const dispatch = useAppDispatch();
  const searchTerm = useAppSelector(selectSkillsBookSearchTerm);
  const activeCategory = useAppSelector(selectSkillsBookActiveCategory);
  const sortBy = useAppSelector(selectSkillsBookSortBy);
  const currentPage = useAppSelector(selectSkillsBookCurrentPage);
  const showAdvancedFilters = useAppSelector(selectSkillsBookShowAdvancedFilters);
  const {
    filterLevelMin,
    filterLevelMax,
    filterConfidenceMin,
    filterConfidenceMax,
    filterProficiencyMin,
  } = useAppSelector(selectSkillsBookNumericFilters);

  // ── Ephemeral, component-local UI state (not worth persisting in Redux) ──
  const [error, setError] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [mockRegistryTick, setMockRegistryTick] = useState(0);
  const bookPageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const existing = mockDataService.get.skills();
    if (existing.length === 0 || existing.length < skillBookDemoSkills.length) {
      mockDataService.register.skills(skillBookDemoSkills);
    }
  }, []);

  useEffect(() => {
    if (!isMockDataEnabled) return;
    return mockDataService.subscribe(() => setMockRegistryTick((tick) => tick + 1));
  }, [isMockDataEnabled]);

  const skills = useMemo(() => {
    if (isMockDataEnabled) {
      const registered = mockDataService.get.skills();
      return registered.length > 0 ? registered : skillBookDemoSkills;
    }
    return data?.skills ?? [];
  }, [data, isMockDataEnabled, mockRegistryTick]);

  const loadSkills = async () => {
    setError(null);
    if (isMockDataEnabled) return;
    try {
      await refetch();
    } catch (err: unknown) {
      console.error('Failed to load skills:', err);
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    }
  };

  // Dynamic categories based on actual skill categories in data
  const availableCategories = useMemo(() => {
    const categoryCounts = new Map<SkillCategoryFilter, number>();
    
    skills.forEach(skill => {
      categoryCounts.set(skill.skill_category, (categoryCounts.get(skill.skill_category) || 0) + 1);
    });

    const categories: SkillCategoryFilter[] = [
      'all',
      'recent',
      'active',
      'inactive',
      'auto_detected',
      'paid',
      'hobby',
      'improving',
      'high_proficiency',
      'high_level',
      'low_level',
      'physical_type',
      'technical_type',
    ];
    
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

    if (activeCategory !== 'all') {
      filtered = filtered.filter(skill => skillMatchesCategory(skill, activeCategory));
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(skill => {
        const profile = readSkillProfile(skill.metadata);
        return (
          skill.skill_name.toLowerCase().includes(term) ||
          skill.description?.toLowerCase().includes(term) ||
          skill.skill_category.toLowerCase().includes(term) ||
          profile?.origin_story?.toLowerCase().includes(term) ||
          profile?.related_projects?.some(p => p.toLowerCase().includes(term)) ||
          profile?.related_jobs?.some(j => j.toLowerCase().includes(term))
        );
      });
    }

    filtered = filtered.filter(skill =>
      skill.current_level >= filterLevelMin && skill.current_level <= filterLevelMax
    );

    filtered = filtered.filter(skill =>
      skill.confidence_score >= filterConfidenceMin && skill.confidence_score <= filterConfidenceMax
    );

    filtered = filtered.filter(skill => {
      const prof = readSkillProfile(skill.metadata)?.proficiency ?? 0;
      return prof >= filterProficiencyMin;
    });

    return filtered;
  }, [skills, activeCategory, searchTerm, filterLevelMin, filterLevelMax, filterConfidenceMin, filterConfidenceMax, filterProficiencyMin]);

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
    return sortedSkills.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedSkills, currentPage]);

  const totalPages = Math.max(1, Math.ceil(sortedSkills.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const visibleStart = sortedSkills.length === 0 ? 0 : startIndex + 1;
  const visibleEnd = Math.min(startIndex + ITEMS_PER_PAGE, sortedSkills.length);

  useEffect(() => {
    dispatch(clampCurrentPage(totalPages));
  }, [dispatch, totalPages]);

  useEffect(() => {
    bookPageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (totalPages <= 1) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        dispatch(goToPrevPage());
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        dispatch(goToNextPage(totalPages));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, totalPages, currentPage]);

  const categoryFilters = useMemo(
    () =>
      availableCategories.map((id) => ({
        id,
        label: formatCategoryLabel(id),
        count: skills.filter((skill) => skillMatchesCategory(skill, id)).length,
      })),
    [availableCategories, skills],
  );

  const bookTheme = useMemo(
    () => skillCategoryTheme(activeCategory === 'all' ? 'technical' : activeCategory),
    [activeCategory],
  );

  const handleSkillClick = (skill: Skill) => {
    setSelectedSkill(skill);
  };

  const handleNavigateToSkill = (skillNameOrId: string) => {
    const needle = skillNameOrId.trim().toLowerCase();
    const match = skills.find(
      (s) =>
        s.id === skillNameOrId ||
        s.skill_name.toLowerCase() === needle ||
        s.skill_name.toLowerCase().includes(needle),
    );
    if (match) setSelectedSkill(match);
  };

  useEffect(() => {
    if (loading) return;
    const id = consumeHighlightItemId();
    if (!id) return;

    let cancelled = false;
    (async () => {
      const resolved = await resolveBookHighlightItem({
        id,
        items: skills,
        match: (skill, needle) =>
          skill.id === needle ||
          skill.skill_name.toLowerCase() === needle.toLowerCase() ||
          skill.skill_name.toLowerCase().includes(needle.toLowerCase()),
        fetchById: fetchSkillById,
      });
      if (!cancelled && resolved) setSelectedSkill(resolved);
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, skills]);

  const handleCloseModal = () => {
    setSelectedSkill(null);
    void loadSkills();
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
            <div key={i} className="min-h-[11rem] rounded-xl bg-white/5 border border-white/8 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DetectedSkillSuggestions
        demoMode={isMockDataEnabled}
        existingBookEntries={skills.map(s => ({ id: s.id, name: s.skill_name }))}
        existingSkillNames={skills.map(s => s.skill_name)}
        onSkillAdded={() => void loadSkills()}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-white truncate">Skills</h2>
          <p className="text-[11px] sm:text-xs text-white/40 mt-0.5">
            {sortedSkills.length} of {skills.length} skills
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSkills()}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-teal-400 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <SearchWithAutocomplete<Skill>
        value={searchTerm}
        onChange={(value) => dispatch(setSearchTerm(value))}
        placeholder="Search by name, category, or description…"
        items={skills}
        getSearchableText={(skill) => {
          const profile = readSkillProfile(skill.metadata);
          return [
            skill.skill_name,
            skill.skill_category,
            skill.description ?? '',
            profile?.origin_story ?? '',
            ...(profile?.related_projects ?? []),
          ].join(' ');
        }}
        getDisplayLabel={(skill) => skill.skill_name}
        maxSuggestions={8}
        className="w-full"
        inputClassName="bg-black/40 border-white/10 text-white placeholder:text-white/30 text-sm"
        emptyHint="No matching skills"
      />

      {/* Filters — compact stacked grid, no horizontal scroll */}
      <div
        className={cn(
          'rounded-xl border p-2 sm:p-2.5 space-y-2 min-w-0 overflow-x-hidden bg-gradient-to-br from-white/[0.04] via-black/20 to-white/[0.02]',
          activeCategory === 'all' ? 'border-white/12' : bookTheme.border,
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <label htmlFor="skills-sort" className="sr-only">
            Sort skills
          </label>
          <select
            id="skills-sort"
            value={sortBy}
            onChange={(e) => dispatch(setSortBy(e.target.value as SkillSortOption))}
            className="flex-1 min-w-0 h-8 sm:h-9 bg-black/40 border border-white/10 text-white rounded-lg px-2 text-[11px] sm:text-xs font-medium"
          >
            {(Object.keys(SORT_LABELS) as SkillSortOption[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => dispatch(toggleAdvancedFilters())}
            aria-expanded={showAdvancedFilters}
            className={`inline-flex items-center justify-center gap-1 h-8 sm:h-9 shrink-0 px-2.5 rounded-lg text-[11px] font-medium border transition-colors touch-manipulation ${
              showAdvancedFilters
                ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                : 'bg-white/4 border-white/10 text-white/55 hover:border-white/25 hover:text-white/75'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            More
          </button>
        </div>

        <div
          className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1 sm:gap-1.5"
          role="group"
          aria-label="Filter by category"
        >
          {categoryFilters.map(({ id, label, count }) => {
            const isActive = activeCategory === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => dispatch(setActiveCategory(id))}
                aria-pressed={isActive}
                className={`relative flex flex-col items-center justify-center w-full min-h-[2.125rem] sm:min-h-[2.25rem] px-1 py-1 rounded-md border text-center transition-colors touch-manipulation ${
                  isActive
                    ? skillFilterChipActive(id)
                    : 'bg-black/30 border-white/8 text-white/55 hover:border-white/20 hover:text-white/75'
                }`}
              >
                <span className="text-[10px] sm:text-[11px] font-semibold leading-tight line-clamp-2">
                  {label}
                </span>
                <span
                  className={`text-[9px] tabular-nums leading-none mt-0.5 ${
                    isActive ? 'opacity-90' : 'text-white/35'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {activeCategory !== 'all' && (
          <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-white/5">
            <p className="text-[10px] text-white/45 truncate">
              Showing{' '}
              <span className={cn('font-medium', skillCategoryTheme(activeCategory).accentText)}>
                {formatCategoryLabel(activeCategory)}
              </span>
            </p>
            <button
              type="button"
              onClick={() => dispatch(setActiveCategory('all'))}
              className="text-[10px] text-white/40 hover:text-white/70 shrink-0"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {showAdvancedFilters && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 sm:p-4 space-y-3">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-white/45">
            Advanced filters
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
            <div>
              <label className="text-[10px] sm:text-xs text-white/55 mb-1 block">Level</label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={filterLevelMin}
                  onChange={(e) => dispatch(setFilterLevelMin(parseInt(e.target.value, 10)))}
                  className="h-8 sm:h-9 bg-black/40 border-white/20 text-white text-xs"
                />
                <span className="text-white/35 text-xs">–</span>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={filterLevelMax}
                  onChange={(e) => dispatch(setFilterLevelMax(parseInt(e.target.value, 10)))}
                  className="h-8 sm:h-9 bg-black/40 border-white/20 text-white text-xs"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] sm:text-xs text-white/55 mb-1 block">
                {epistemicFieldLabel()} (0–100%)
              </label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(filterConfidenceMin * 100)}
                  onChange={(e) => dispatch(setFilterConfidenceMin(parseFloat(e.target.value) / 100))}
                  className="h-8 sm:h-9 bg-black/40 border-white/20 text-white text-xs"
                  aria-label="Minimum certainty percent"
                />
                <span className="text-white/35 text-xs">–</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(filterConfidenceMax * 100)}
                  onChange={(e) => dispatch(setFilterConfidenceMax(parseFloat(e.target.value) / 100))}
                  className="h-8 sm:h-9 bg-black/40 border-white/20 text-white text-xs"
                  aria-label="Maximum certainty percent"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] sm:text-xs text-white/55 mb-1 block">Min proficiency</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={filterProficiencyMin}
                onChange={(e) => dispatch(setFilterProficiencyMin(parseInt(e.target.value, 10)))}
                className="h-8 sm:h-9 bg-black/40 border-white/20 text-white text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {sortedSkills.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="h-10 w-10 mx-auto mb-3 text-white/15" />
          <p className="text-sm font-medium text-white/50 mb-1">No skills found</p>
          <p className="text-xs text-white/30">Mention skills in chat and LoreBook will track them</p>
        </div>
      ) : (
        <div
          ref={bookPageRef}
          className={cn(
            'relative w-full min-w-0 rounded-lg border-2 shadow-2xl overflow-hidden flex flex-col bg-gradient-to-br scroll-mt-4',
            activeCategory === 'all'
              ? 'from-violet-950/30 via-black/45 to-cyan-950/25 border-violet-700/35'
              : cn(bookTheme.bodyGrad, bookTheme.border),
          )}
        >
          <div className={cn('absolute inset-x-0 top-0 h-24 bg-gradient-to-b opacity-50 pointer-events-none', bookTheme.headerGrad)} />
          <div className="relative p-3 flex flex-col flex-1 min-h-0">
            <div className={cn('flex flex-col gap-2 mb-3 pb-3 border-b', bookTheme.border)}>
              <div className="flex items-center gap-2.5 min-w-0">
                <BookOpen className={cn('h-5 w-5 shrink-0', bookTheme.icon)} />
                <div className="min-w-0">
                  <h3 className={cn('text-xs font-semibold uppercase tracking-wider', bookTheme.accentText)}>
                    Skills Book
                  </h3>
                  <p className={cn('text-[11px] mt-0.5 truncate opacity-80', bookTheme.accentText)}>
                    Page {currentPage} of {totalPages} · {sortedSkills.length} skills
                  </p>
                  <BookTrustSummary domain="skills" className="mt-1" />
                </div>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 mb-3 content-start min-h-0 auto-rows-fr">
              {paginatedSkills.map((skill) => (
                <SkillProfileCard
                  key={skill.id}
                  skill={skill}
                  onClick={() => handleSkillClick(skill)}
                  showProgress
                  className="h-full"
                />
              ))}
            </div>

            <div className={cn('flex flex-col gap-2 pt-3 border-t mt-auto', bookTheme.border)}>
              <p className={cn('text-[10px] text-center tabular-nums order-2', bookTheme.accentText, 'opacity-70')}>
                {visibleStart}–{visibleEnd} of {sortedSkills.length} skills
              </p>

              <div className="flex items-center gap-2 w-full order-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch(goToPrevPage())}
                  disabled={currentPage === 1}
                  className={cn(
                    'flex-1 min-h-[40px] touch-manipulation',
                    bookTheme.accentText,
                    'opacity-70 hover:opacity-100 hover:bg-white/5 disabled:opacity-30',
                  )}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Prev
                </Button>

                <div className="flex items-center gap-1 px-2 py-1 bg-black/40 rounded-lg border border-white/10 shrink-0">
                  <span className={cn('text-[11px] font-medium tabular-nums px-1', bookTheme.accentText)}>
                    {currentPage}/{totalPages}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch(goToNextPage(totalPages))}
                  disabled={currentPage === totalPages}
                  className={cn(
                    'flex-1 min-h-[40px] touch-manipulation',
                    bookTheme.accentText,
                    'opacity-70 hover:opacity-100 hover:bg-white/5 disabled:opacity-30',
                  )}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedSkill && (
        <SkillDetailModal
          skill={selectedSkill}
          onClose={handleCloseModal}
          onUpdate={loadSkills}
          onNavigateToSkill={handleNavigateToSkill}
        />
      )}
    </div>
  );
};
