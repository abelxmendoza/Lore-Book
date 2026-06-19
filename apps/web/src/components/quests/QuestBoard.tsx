import { useState, useMemo, useEffect } from 'react';
import { Search, Filter, X, Target, Award, Check, Pause, Play, ArrowUpDown, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Card, CardContent } from '../ui/card';
import { MobileBottomSheet } from '../ui/MobileBottomSheet';
import { QuestDetailPanel } from './QuestDetailPanel';
import { DetectedQuestSuggestions } from './DetectedQuestSuggestions';
import { useQuestBoard, useStartQuest, useCompleteQuest, usePauseQuest } from '../../hooks/useQuests';
import { EMPTY_QUEST_BOARD } from '../../store/hooks/useQuestData';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { Quest, QuestStatus, QuestType } from '../../types/quest';

// Prevent body scroll only when mobile detail overlay is open (sm:hidden fixed modal)
const useBodyScrollLock = (isLocked: boolean) => {
  useEffect(() => {
    if (isLocked) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isLocked]);
};

type QuestBoardProps = {
  onOpenAppSidebar?: () => void;
};

const SORT_KEYS = ['priority', 'activity', 'progress', 'due_date'] as const;
const SORT_LABELS: Record<string, string> = {
  priority: 'Priority',
  activity: 'Recent',
  progress: 'Progress',
  due_date: 'Due soon',
};

type QuestCategoryId = 'all' | 'today' | 'week' | 'main' | 'side' | 'completed';

interface QuestCategoryNavProps {
  selectedCategory: QuestCategoryId;
  onSelect: (id: QuestCategoryId) => void;
  counts: {
    all: number;
    today: number;
    week: number;
    main: number;
    side: number;
    completed: number;
  };
}

const QUEST_CATEGORY_TABS: { id: QuestCategoryId; label: string; shortLabel: string }[] = [
  { id: 'all', label: 'All quests', shortLabel: 'All' },
  { id: 'today', label: 'Today', shortLabel: 'Today' },
  { id: 'week', label: 'This week', shortLabel: 'Week' },
  { id: 'main', label: 'Main quests', shortLabel: 'Main' },
  { id: 'side', label: 'Side quests', shortLabel: 'Side' },
  { id: 'completed', label: 'Completed', shortLabel: 'Done' },
];

function QuestCategoryNav({ selectedCategory, onSelect, counts }: QuestCategoryNavProps) {
  return (
    <nav
      data-testid="quest-category-nav"
      aria-label="Quest categories"
      className="shrink-0 border-b border-white/10 bg-black/30 px-2 py-2 sm:px-3"
    >
      <ul className="flex gap-1.5 overflow-x-auto sm:grid sm:grid-cols-3 sm:overflow-visible pb-0.5 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {QUEST_CATEGORY_TABS.map((tab) => {
          const selected = selectedCategory === tab.id;
          const count = counts[tab.id];
          return (
            <li key={tab.id} className="shrink-0 sm:shrink">
              <button
                type="button"
                data-testid={`quest-tab-${tab.id}`}
                aria-current={selected ? 'page' : undefined}
                onClick={() => onSelect(tab.id)}
                className={`flex w-full min-h-[36px] min-w-[4.5rem] sm:min-w-0 items-center justify-center gap-1 rounded-full sm:rounded-md px-3 py-1.5 text-[11px] sm:text-xs font-medium transition-colors touch-manipulation whitespace-nowrap ${
                  selected
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    : 'text-white/55 hover:text-white hover:bg-white/5 border border-white/10 bg-black/20'
                }`}
              >
                <span>{tab.shortLabel}</span>
                <span
                  className={`shrink-0 text-[9px] tabular-nums px-1 py-0.5 rounded ${
                    selected ? 'bg-amber-500/25 text-amber-200' : 'bg-white/10 text-white/40'
                  }`}
                >
                  {count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export const QuestBoard = ({ onOpenAppSidebar }: QuestBoardProps = {}) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  // Lock body scroll only when mobile detail overlay is open (desktop detail lives in right panel, no lock)
  useBodyScrollLock(selectedQuestId !== null && isMobile);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<QuestStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<QuestType | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<QuestCategoryId>('all');
  const [sortKey, setSortKey] = useState<'priority' | 'activity' | 'progress' | 'due_date'>('priority');
  const cycleSort = () => setSortKey(prev => SORT_KEYS[(SORT_KEYS.indexOf(prev) + 1) % SORT_KEYS.length]);

  const startQuest = useStartQuest();
  const completeQuest = useCompleteQuest();
  const pauseQuest = usePauseQuest();

  const { data: boardData, isLoading, error, refetch: refetchBoard } = useQuestBoard();
  const board = boardData ?? EMPTY_QUEST_BOARD;
  const loadFailed = !isLoading && Boolean(error);

  const existingQuestTitles = useMemo(() => {
    if (!board) return [];
    return [
      ...(board.main_quests || []),
      ...(board.side_quests || []),
      ...(board.daily_quests || []),
      ...(board.todays_quests || []),
      ...(board.this_weeks_quests || []),
      ...(board.completed_quests || []),
    ].map((q: Quest) => q.title);
  }, [board]);

  // Get all unique categories from quests
  const allCategories = useMemo(() => {
    if (!board) return [];
    const allQuests = [
      ...(board.main_quests || []),
      ...(board.side_quests || []),
      ...(board.daily_quests || []),
      ...(board.completed_quests || []),
    ];
    const categories = new Set<string>();
    allQuests.forEach(q => {
      if (q.category) categories.add(q.category);
    });
    return Array.from(categories).sort();
  }, [board]);

  // Memoize filter function
  const filterQuests = useMemo(() => {
    return (quests: Quest[]) => {
      let filtered = quests;

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(
          q =>
            q.title.toLowerCase().includes(query) ||
            q.description?.toLowerCase().includes(query) ||
            q.tags?.some(tag => tag.toLowerCase().includes(query))
        );
      }

      // Status filter
      if (statusFilter !== 'all') {
        filtered = filtered.filter(q => q.status === statusFilter);
      }

      // Type filter
      if (typeFilter !== 'all') {
        filtered = filtered.filter(q => q.quest_type === typeFilter);
      }

      // Priority filter
      if (priorityFilter !== 'all') {
        const minPriority = parseInt(priorityFilter);
        filtered = filtered.filter(q => q.priority >= minPriority);
      }

      // Category filter
      if (categoryFilter !== 'all') {
        filtered = filtered.filter(q => q.category === categoryFilter);
      }

      return filtered;
    };
  }, [searchQuery, statusFilter, typeFilter, priorityFilter, categoryFilter]);

  // Memoize quest arrays
  const mainQuests = useMemo(() => {
    if (!board) return [];
    return Array.isArray(board.main_quests) ? board.main_quests : [];
  }, [board]);

  const sideQuests = useMemo(() => {
    if (!board) return [];
    return Array.isArray(board.side_quests) ? board.side_quests : [];
  }, [board]);

  // Keep dailyQuests for backward compatibility but don't use in UI
  const dailyQuests = useMemo(() => {
    if (!board) return [];
    return Array.isArray(board.daily_quests) ? board.daily_quests : [];
  }, [board]);

  const completedQuests = useMemo(() => {
    if (!board) return [];
    return Array.isArray(board.completed_quests) ? board.completed_quests : [];
  }, [board]);

  // Calculate time-based quests (use from board if available, otherwise calculate)
  const todaysQuests = useMemo(() => {
    if (!board) return [];
    // Use from board if available
    if (board.todays_quests && Array.isArray(board.todays_quests)) {
      return board.todays_quests;
    }
    // Otherwise calculate
    const all = [...mainQuests, ...sideQuests, ...completedQuests];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return all.filter(q => {
      // Mentioned today in chat
      if (q.last_activity_at) {
        const lastActivity = new Date(q.last_activity_at);
        lastActivity.setHours(0, 0, 0, 0);
        if (lastActivity.getTime() === today.getTime()) return true;
      }
      // Due today
      if (q.estimated_completion_date) {
        const dueDate = new Date(q.estimated_completion_date);
        dueDate.setHours(0, 0, 0, 0);
        if (dueDate.getTime() === today.getTime()) return true;
      }
      return false;
    });
  }, [board, mainQuests, sideQuests, completedQuests]);

  const thisWeeksQuests = useMemo(() => {
    if (!board) return [];
    // Use from board if available
    if (board.this_weeks_quests && Array.isArray(board.this_weeks_quests)) {
      return board.this_weeks_quests;
    }
    // Otherwise calculate
    const all = [...mainQuests, ...sideQuests];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    
    return all.filter(q => {
      if (q.estimated_completion_date) {
        const dueDate = new Date(q.estimated_completion_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate >= today && dueDate <= weekEnd;
      }
      return false;
    });
  }, [board, mainQuests, sideQuests]);

  // Memoize displayed quests (deduplicate by id so React keys are unique when a quest appears in multiple categories)
  const displayedQuests = useMemo(() => {
    if (!board) return [];
    
    let questsToFilter: Quest[] = [];
    switch (selectedCategory) {
      case 'today': questsToFilter = todaysQuests; break;
      case 'week': questsToFilter = thisWeeksQuests; break;
      case 'main': questsToFilter = mainQuests; break;
      case 'side': questsToFilter = sideQuests; break;
      case 'completed': questsToFilter = completedQuests; break;
      default: questsToFilter = [
        ...mainQuests,
        ...sideQuests,
        ...dailyQuests,
        ...todaysQuests,
        ...thisWeeksQuests,
        ...completedQuests,
      ];
    }
    const byId = new Map<string, Quest>();
    questsToFilter.forEach(q => { if (!byId.has(q.id)) byId.set(q.id, q); });
    const unique = Array.from(byId.values());
    const filtered = filterQuests(unique);
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'priority': return b.priority - a.priority;
        case 'activity': {
          const at = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
          const bt = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
          return bt - at;
        }
        case 'progress': return b.progress_percentage - a.progress_percentage;
        case 'due_date': {
          const ad = a.estimated_completion_date ? new Date(a.estimated_completion_date).getTime() : Infinity;
          const bd = b.estimated_completion_date ? new Date(b.estimated_completion_date).getTime() : Infinity;
          return ad - bd;
        }
        default: return 0;
      }
    });
  }, [selectedCategory, mainQuests, sideQuests, dailyQuests, todaysQuests, thisWeeksQuests, completedQuests, filterQuests, sortKey]);

  const uniqueQuestCount = useMemo(() => {
    const byId = new Map<string, Quest>();
    [...mainQuests, ...sideQuests, ...dailyQuests, ...completedQuests].forEach((q) => {
      if (!byId.has(q.id)) byId.set(q.id, q);
    });
    return byId.size;
  }, [mainQuests, sideQuests, dailyQuests, completedQuests]);

  const activeQuestCount = useMemo(
    () => [...mainQuests, ...sideQuests].filter((q) => q.status === 'active').length,
    [mainQuests, sideQuests]
  );

  // Auto-select first quest if none selected or current selection is not in displayed quests
  // Only auto-select on desktop (not mobile) to avoid auto-opening modal
  useEffect(() => {
    // Check if we're on mobile
    const isMobile = window.innerWidth < 640; // sm breakpoint
    
    if (displayedQuests.length > 0) {
      const currentQuestExists = displayedQuests.some(q => q.id === selectedQuestId);
      // Only auto-select on desktop, or if we already had a selection that's still valid
      if (!isMobile && (!selectedQuestId || !currentQuestExists)) {
        setSelectedQuestId(displayedQuests[0].id);
      } else if (isMobile && selectedQuestId && !currentQuestExists) {
        // On mobile, if the selected quest is no longer in the list, clear selection
        setSelectedQuestId(null);
      }
    } else if (displayedQuests.length === 0) {
      setSelectedQuestId(null);
    }
  }, [selectedCategory, displayedQuests, selectedQuestId]);

  const categoryCounts = useMemo(
    () => ({
      all: uniqueQuestCount,
      today: todaysQuests.length,
      week: thisWeeksQuests.length,
      main: mainQuests.length,
      side: sideQuests.length,
      completed: completedQuests.length,
    }),
    [
      uniqueQuestCount,
      todaysQuests.length,
      thisWeeksQuests.length,
      mainQuests.length,
      sideQuests.length,
      completedQuests.length,
    ]
  );

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTypeFilter('all');
    setPriorityFilter('all');
    setCategoryFilter('all');
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || priorityFilter !== 'all' || categoryFilter !== 'all';

  const isBoardEmpty =
    (board.main_quests?.length ?? 0) === 0 &&
    (board.side_quests?.length ?? 0) === 0 &&
    (board.daily_quests?.length ?? 0) === 0 &&
    (board.completed_quests?.length ?? 0) === 0;

  if (isLoading) {
    return (
      <div
        data-testid="quest-board-loading"
        className="flex h-full min-h-0 w-full flex-1 items-center justify-center"
      >
        <div className="text-center">
          <Target className="h-8 w-8 text-amber-400/60 mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-white/55">Loading your quest log…</p>
        </div>
      </div>
    );
  }

  if (loadFailed && isBoardEmpty) {
    return (
      <div
        data-testid="quest-board-error"
        className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <Target className="h-10 w-10 text-red-400/40" />
        <p className="text-red-400 text-sm font-medium">Could not load quests</p>
        <p className="text-white/50 text-sm max-w-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void refetchBoard()}>
          Retry
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigate('/chat')} className="text-white/50">
          Go to Chat
        </Button>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'border-green-500/50 bg-green-500/5';
      case 'completed': return 'border-yellow-500/50 bg-yellow-500/5';
      case 'paused': return 'border-orange-500/50 bg-orange-500/5';
      case 'abandoned': return 'border-red-500/50 bg-red-500/5';
      default: return 'border-primary/50 bg-primary/5';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'main': return 'text-blue-400';
      case 'side': return 'text-purple-400';
      case 'daily': return 'text-green-400';
      case 'achievement': return 'text-yellow-400';
      default: return 'text-primary';
    }
  };

  const getTypeStripeColor = (type: string) => {
    switch (type) {
      case 'main': return 'bg-blue-500';
      case 'side': return 'bg-purple-500';
      case 'daily': return 'bg-green-500';
      case 'achievement': return 'bg-yellow-500';
      default: return 'bg-primary';
    }
  };

  const getTimeAgo = (dateStr?: string): string | null => {
    if (!dateStr) return null;
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
    return `${Math.floor(diff / 2592000)}mo ago`;
  };

  const getActivityColor = (dateStr?: string) => {
    if (!dateStr) return 'text-white/20';
    const days = (Date.now() - new Date(dateStr).getTime()) / 86400000;
    if (days < 7) return 'text-green-400/70';
    if (days < 30) return 'text-yellow-400/70';
    return 'text-red-400/50';
  };

  return (
    <div
      data-testid="quest-board"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-black/20"
    >
      {/* Mobile top bar — quests surface hides the global App header */}
      <div
        className="lg:hidden flex items-center justify-between gap-2 border-b border-white/10 bg-black/90 backdrop-blur-md shrink-0 px-2"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
          paddingBottom: '8px',
        }}
      >
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {onOpenAppSidebar && (
            <button
              type="button"
              onClick={onOpenAppSidebar}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg active:bg-white/10 touch-manipulation"
              aria-label="Open app menu"
            >
              <Menu className="h-5 w-5 text-white/50" />
            </button>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">Quest Log</p>
            <p className="text-[10px] text-white/45 truncate">
              {activeQuestCount} active · {uniqueQuestCount} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={cycleSort}
            className="h-9 px-2.5 flex items-center gap-1 rounded-lg border border-white/10 text-white/70 text-xs touch-manipulation active:bg-white/10"
            aria-label={`Sort by ${SORT_LABELS[sortKey]}`}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span className="max-w-[4rem] truncate">{SORT_LABELS[sortKey]}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`h-9 w-9 flex items-center justify-center rounded-lg border touch-manipulation active:bg-white/10 ${
              showFilters || hasActiveFilters
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-white/10 text-white/60'
            }`}
            aria-label="Toggle filters"
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Inline error — single banner for all breakpoints */}
      {loadFailed && (
        <div
          data-testid="quest-board-error-banner"
          className="shrink-0 mx-3 mt-2 lg:mx-0 lg:mt-0 lg:px-5 lg:py-2 lg:border-b lg:border-red-500/10 rounded-lg lg:rounded-none border border-red-500/30 bg-red-500/10 px-3 py-2 flex items-center justify-between gap-2"
        >
          <p className="text-xs text-red-300 truncate">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void refetchBoard()} className="h-8 shrink-0">
            Retry
          </Button>
        </div>
      )}

      {/* Desktop header */}
      <header
        data-testid="quest-board-header"
        className="hidden lg:block shrink-0 border-b border-white/10 bg-black/40 px-5 py-3 space-y-2"
      >
        <div className="flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/30 shrink-0">
              <Target className="h-5 w-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white tracking-tight">Quest Log</h1>
              <p className="text-xs text-white/55">
                {activeQuestCount} active · {uniqueQuestCount} total ·{' '}
                <button
                  type="button"
                  onClick={() => navigate('/chat')}
                  className="text-primary/80 hover:text-primary underline-offset-2 hover:underline"
                >
                  add goals in Chat
                </button>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={cycleSort}
              className="h-9 border-white/15 text-white/80 hover:bg-white/5"
            >
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <span className="text-sm">{SORT_LABELS[sortKey]}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={`h-9 border-white/15 text-white/80 hover:bg-white/5 ${
                showFilters ? 'bg-white/10 border-white/25' : ''
              }`}
            >
              <Filter className="h-4 w-4 mr-1.5" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-primary/30 text-primary">
                  {[searchQuery, statusFilter, typeFilter, priorityFilter, categoryFilter].filter(
                    (f) => f !== 'all' && f !== ''
                  ).length}
                </span>
              )}
            </Button>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 text-white/50 hover:text-white"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/discovery/achievements')}
              className="h-9 border-white/15 text-white/80 hover:bg-white/5"
            >
              <Award className="h-4 w-4 mr-1.5" />
              Achievements
            </Button>
          </div>
        </div>

        {showFilters && (
          <Card className="bg-black/40 border-white/10">
            <CardContent className="p-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="relative col-span-2 lg:col-span-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <Input
                    placeholder="Search quests…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-black/40 border-white/10 text-white placeholder:text-white/40 h-10"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as QuestStatus | 'all')}
                  className="bg-black/40 border-white/10 text-white h-10"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="abandoned">Abandoned</option>
                </Select>
                <Select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as QuestType | 'all')}
                  className="bg-black/40 border-white/10 text-white h-10"
                >
                  <option value="all">All types</option>
                  <option value="main">Main quests</option>
                  <option value="side">Side quests</option>
                  <option value="daily">Daily quests</option>
                  <option value="achievement">Achievements</option>
                </Select>
                {allCategories.length > 0 && (
                  <Select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-black/40 border-white/10 text-white h-10"
                  >
                    <option value="all">All categories</option>
                    {allCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </header>

      {/* Mobile filters drawer */}
      {showFilters && (
        <div className="lg:hidden shrink-0 border-b border-white/10 bg-black/50 px-3 py-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <Input
              placeholder="Search quests…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-black/40 border-white/10 text-white placeholder:text-white/40 h-10"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as QuestStatus | 'all')}
              className="bg-black/40 border-white/10 text-white h-10 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="abandoned">Abandoned</option>
            </Select>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as QuestType | 'all')}
              className="bg-black/40 border-white/10 text-white h-10 text-sm"
            >
              <option value="all">All types</option>
              <option value="main">Main</option>
              <option value="side">Side</option>
              <option value="daily">Daily</option>
              <option value="achievement">Achievement</option>
            </Select>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full h-9 text-white/50">
              <X className="h-4 w-4 mr-1" />
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Mobile quick links */}
      <div className="lg:hidden shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/25 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => navigate('/chat')}
          className="shrink-0 text-xs text-primary/80 px-2.5 py-1.5 rounded-full border border-primary/25 bg-primary/5 touch-manipulation"
        >
          Add in Chat
        </button>
        <button
          type="button"
          onClick={() => navigate('/discovery/achievements')}
          className="shrink-0 flex items-center gap-1 text-xs text-white/55 px-2.5 py-1.5 rounded-full border border-white/10 touch-manipulation"
        >
          <Award className="h-3.5 w-3.5" />
          Achievements
        </button>
      </div>

      {/* Body fills remaining viewport height */}
      <div
        data-testid="quest-board-body"
        className="flex min-h-0 flex-1 flex-col sm:flex-row overflow-hidden"
      >
        <section
          data-testid="quest-board-list-pane"
          className="flex min-h-0 flex-1 flex-col overflow-hidden sm:w-[min(100%,28rem)] lg:w-[min(100%,32rem)] sm:border-r border-white/10 bg-black/20"
        >
          <div data-testid="quest-board-suggestions" className="shrink-0 px-2 pt-2 sm:px-3">
            <DetectedQuestSuggestions
              existingQuestTitles={existingQuestTitles}
              onQuestAdded={() => void refetchBoard()}
            />
          </div>

          <QuestCategoryNav
            selectedCategory={selectedCategory}
            onSelect={setSelectedCategory}
            counts={categoryCounts}
          />

          <div className="shrink-0 border-b border-white/10 bg-black/25 px-3 py-1.5 sm:px-4 sm:py-2 flex items-baseline justify-between gap-2">
            <h2
              data-testid="quest-list-heading"
              className="text-sm font-semibold text-white"
            >
              {selectedCategory === 'completed' ? 'Completed' : 'In progress'}
            </h2>
            <p className="text-xs text-white/45 shrink-0">
              {displayedQuests.length} quest{displayedQuests.length === 1 ? '' : 's'}
            </p>
          </div>

          <div
            data-testid="quest-board-list"
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {displayedQuests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center px-4 gap-3">
                <Target className="h-10 w-10 text-white/15" />
                <p className="text-sm font-medium text-white/70">No quests here yet</p>
                <p className="text-xs text-white/45 max-w-[240px] leading-relaxed">
                  {hasActiveFilters
                    ? 'Try adjusting or clearing your filters.'
                    : 'Mention a goal in Chat — quests are auto-detected from your story.'}
                </p>
                {!hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={() => navigate('/chat')}>
                    Go to Chat
                  </Button>
                )}
              </div>
            ) : (
              displayedQuests.map((quest) => {
                const activityTime = getTimeAgo(quest.last_activity_at);
                const activityColor = getActivityColor(quest.last_activity_at);
                const selected = selectedQuestId === quest.id;

                return (
                  <button
                    type="button"
                    key={quest.id}
                    onClick={() => setSelectedQuestId(quest.id)}
                    className={`relative w-full text-left rounded-xl border p-3 transition-all overflow-hidden touch-manipulation active:scale-[0.99] ${
                      selected
                        ? 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.08)]'
                        : `${getStatusColor(quest.status)} hover:border-white/20 hover:bg-white/[0.03]`
                    }`}
                  >
                    <span
                      className={`absolute left-0 inset-y-0 w-1 ${getTypeStripeColor(quest.quest_type)}`}
                      aria-hidden="true"
                    />

                    <div className="flex items-center justify-between gap-2 mb-1.5 pl-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-[10px] font-medium uppercase tracking-wide ${getTypeColor(quest.quest_type)}`}>
                          {quest.quest_type}
                        </span>
                        {quest.source === 'extracted' && (
                          <span className="text-[10px] text-primary/70">Auto</span>
                        )}
                      </div>
                      <div
                        className="flex items-center gap-0.5 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {quest.status === 'active' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                pauseQuest.mutateAsync(quest.id).catch(() => {});
                              }}
                              className="h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded-md text-white/35 hover:text-orange-400 hover:bg-orange-400/10 touch-manipulation"
                              title="Pause"
                              aria-label="Pause quest"
                            >
                              <Pause className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                completeQuest.mutateAsync({ questId: quest.id }).catch(() => {});
                              }}
                              className="h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded-md text-white/35 hover:text-green-400 hover:bg-green-400/10 touch-manipulation"
                              title="Complete"
                              aria-label="Complete quest"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {quest.status === 'paused' && (
                          <button
                            type="button"
                            onClick={() => {
                              startQuest.mutateAsync(quest.id).catch(() => {});
                            }}
                            className="h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded-md text-white/35 hover:text-blue-400 hover:bg-blue-400/10 touch-manipulation"
                            title="Resume"
                            aria-label="Resume quest"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <h3 className="text-sm sm:text-base font-semibold text-white mb-1 leading-snug line-clamp-2 pl-2">
                      {quest.title}
                    </h3>

                    {quest.description && (
                      <p className="text-xs text-white/55 line-clamp-2 mb-2 pl-2 leading-relaxed">
                        {quest.description}
                      </p>
                    )}

                    <div className="pl-2 mb-2">
                      <div className="h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/5">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500/80 to-amber-400/60 transition-all duration-500"
                          style={{ width: `${quest.progress_percentage}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pl-2">
                      <div className="flex items-center gap-2 text-[10px] text-white/45">
                        <span>{Math.round(quest.progress_percentage)}%</span>
                        {quest.status !== 'active' && (
                          <span className="capitalize">{quest.status}</span>
                        )}
                      </div>
                      {activityTime && (
                        <div className={`flex items-center gap-1 text-[10px] flex-shrink-0 ${activityColor}`}>
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
                          {activityTime}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section
          data-testid="quest-board-detail-pane"
          className="hidden sm:flex min-h-0 min-w-0 flex-1"
        >
          <QuestDetailPanel questId={selectedQuestId} />
        </section>
      </div>

      {/* Mobile quest detail — bottom sheet */}
      {selectedQuestId && isMobile && (
        <MobileBottomSheet open onClose={() => setSelectedQuestId(null)}>
          <div className="-mx-4 flex flex-col min-h-[min(65dvh,480px)]">
            <QuestDetailPanel
              questId={selectedQuestId}
              onClose={() => setSelectedQuestId(null)}
              mobile
              embedded
            />
          </div>
        </MobileBottomSheet>
      )}
    </div>
  );
};
