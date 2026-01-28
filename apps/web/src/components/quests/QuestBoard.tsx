import { useState, useMemo, useEffect } from 'react';
import { Search, Filter, X, Sparkles, List as ListIcon, Award } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { QuestDetailPanel } from './QuestDetailPanel';
import { ChatFirstViewHint } from '../ChatFirstViewHint';
import { useQuestBoard } from '../../hooks/useQuests';
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

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth < 640 : false)
  );
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 639px)');
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isMobile;
};

export const QuestBoard = () => {
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
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'today' | 'week' | 'main' | 'side' | 'completed'>('all');
  
  const { data: board, isLoading, error } = useQuestBoard();

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

  // Memoize displayed quests
  const displayedQuests = useMemo(() => {
    if (!board) return [];
    
    let questsToFilter: Quest[] = [];
    switch (selectedCategory) {
      case 'today': questsToFilter = todaysQuests; break;
      case 'week': questsToFilter = thisWeeksQuests; break;
      case 'main': questsToFilter = mainQuests; break;
      case 'side': questsToFilter = sideQuests; break;
      case 'completed': questsToFilter = completedQuests; break;
      default: questsToFilter = [...mainQuests, ...sideQuests, ...todaysQuests, ...thisWeeksQuests, ...completedQuests];
    }
    
    return filterQuests(questsToFilter);
  }, [selectedCategory, mainQuests, sideQuests, todaysQuests, thisWeeksQuests, completedQuests, filterQuests]);

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

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTypeFilter('all');
    setPriorityFilter('all');
    setCategoryFilter('all');
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || priorityFilter !== 'all' || categoryFilter !== 'all';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-primary/60 font-mono animate-pulse">LOADING QUEST DATABASE...</div>
      </div>
    );
  }

  if (error && !board) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="text-red-400 font-mono">ERROR: FAILED TO LOAD QUESTS</div>
        <div className="text-white/60 text-sm font-mono">Using mock data for demonstration</div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-white/60 font-mono">LOADING...</div>
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

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full">
      <div className="flex-shrink-0 px-2 sm:px-4 pt-2 sm:pt-3">
        <ChatFirstViewHint />
      </div>
      {/* Cyberpunk Header */}
      <div className="relative overflow-hidden neon-surface border-b border-primary/30 p-3 sm:p-4 sm:p-6 flex-shrink-0">
        <div className="relative z-10">
          <div className="flex items-center gap-2 sm:gap-3 mb-3">
            <div className="p-1.5 sm:p-2 rounded bg-primary/20 border border-primary/50 flex-shrink-0">
              <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl sm:text-2xl md:text-3xl font-bold text-white font-techno tracking-wider mb-1">
                QUEST LOG
              </h1>
              <p className="text-[10px] sm:text-xs sm:text-sm text-primary/60 font-mono">
                {'>'} Auto-detected from conversations • Life changes tracked
              </p>
            </div>
          </div>
          
          {/* Filters & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={`h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 ${
                showFilters ? 'bg-primary/20 border-primary/50' : ''
              }`}
            >
              <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">FILTERS</span>
              {hasActiveFilters && (
                <span className="ml-1 sm:ml-2 px-1 sm:px-1.5 py-0.5 text-[10px] sm:text-xs rounded bg-primary/30 text-primary">
                  {[searchQuery, statusFilter, typeFilter, priorityFilter, categoryFilter].filter(f => f !== 'all' && f !== '').length}
                </span>
              )}
            </Button>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm text-primary/60 hover:text-primary hover:bg-primary/20"
              >
                <X className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                <span className="hidden sm:inline">CLEAR</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/discovery?panel=achievements')}
              className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50"
            >
              <Award className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">ACHIEVEMENTS</span>
            </Button>
          </div>
        </div>
        
        {/* Grid background and scan line effect */}
        <div className="absolute inset-0 grid-surface opacity-30 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="p-2 sm:p-3 sm:p-4 bg-black/60 border-b border-primary/20 backdrop-blur-sm flex-shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="relative">
              <Search className="absolute left-2.5 sm:left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary/40" />
              <Input
                placeholder="Search quests..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 sm:pl-10 bg-black/40 border-primary/30 text-sm h-8 sm:h-9 sm:h-10 text-white placeholder:text-white/40 focus:border-primary/50"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as QuestStatus | 'all')}
              className="bg-black/40 border-primary/30 text-sm h-8 sm:h-9 sm:h-10 text-white"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="abandoned">Abandoned</option>
            </Select>
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as QuestType | 'all')}
              className="bg-black/40 border-primary/30 text-sm h-8 sm:h-9 sm:h-10 text-white"
            >
              <option value="all">All Types</option>
              <option value="main">Main Quests</option>
              <option value="side">Side Quests</option>
              <option value="daily">Daily Quests</option>
              <option value="achievement">Achievements</option>
            </Select>
            {allCategories.length > 0 && (
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-black/40 border-primary/30 text-sm h-8 sm:h-9 sm:h-10 text-white"
              >
                <option value="all">All Categories</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </Select>
            )}
          </div>
        </div>
      )}

      {/* Main Content - Side by Side */}
      <div className="flex-1 flex overflow-hidden min-h-0 gap-0 px-0 sm:gap-4 sm:px-4">
        {/* Left Panel - Quest List */}
        <div className="w-full sm:w-1/2 lg:w-2/5 border-r-0 sm:border-r border-primary/20 bg-black/20 flex flex-col min-h-0 pr-0 sm:pr-4">
          {/* Category Tabs */}
          <div className="flex flex-wrap border-b border-primary/20 bg-black/40 flex-shrink-0">
            {[
              { id: 'all', label: 'ALL', count: mainQuests.length + sideQuests.length + todaysQuests.length + thisWeeksQuests.length + completedQuests.length },
              { id: 'today', label: 'TODAY', count: todaysQuests.length, color: 'primary' },
              { id: 'week', label: 'THIS WEEK', count: thisWeeksQuests.length, color: 'secondary' },
              { id: 'main', label: 'MAIN', count: mainQuests.length, color: 'blue' },
              { id: 'side', label: 'SIDE', count: sideQuests.length, color: 'purple' },
              { id: 'completed', label: 'COMPLETE', count: completedQuests.length, color: 'yellow' },
            ].map((tab) => {
              const getTabClasses = () => {
                if (selectedCategory !== tab.id) {
                  return 'text-white/60 hover:text-white hover:bg-black/40';
                }
                switch (tab.color) {
                  case 'primary': return 'bg-primary/20 text-primary border-b-2 border-primary';
                  case 'secondary': return 'bg-secondary/20 text-secondary border-b-2 border-secondary';
                  case 'blue': return 'bg-blue-500/20 text-blue-400 border-b-2 border-blue-500';
                  case 'purple': return 'bg-purple-500/20 text-purple-400 border-b-2 border-purple-500';
                  case 'yellow': return 'bg-yellow-500/20 text-yellow-400 border-b-2 border-yellow-500';
                  default: return 'bg-primary/20 text-primary border-b-2 border-primary';
                }
              };

              const getBadgeClasses = () => {
                if (selectedCategory !== tab.id) {
                  return 'bg-white/10 text-white/40';
                }
                switch (tab.color) {
                  case 'primary': return 'bg-primary/30 text-primary';
                  case 'secondary': return 'bg-secondary/30 text-secondary';
                  case 'blue': return 'bg-blue-500/30 text-blue-400';
                  case 'purple': return 'bg-purple-500/30 text-purple-400';
                  case 'yellow': return 'bg-yellow-500/30 text-yellow-400';
                  default: return 'bg-primary/30 text-primary';
                }
              };

              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setSelectedCategory(tab.id as any);
                    if (displayedQuests.length > 0 && !displayedQuests.find(q => q.id === selectedQuestId)) {
                      setSelectedQuestId(displayedQuests[0]?.id || null);
                    }
                  }}
                  className={`flex-1 min-w-[50%] sm:min-w-[33.333%] px-2 py-1.5 sm:px-4 sm:py-2 sm:py-3 text-[10px] sm:text-xs sm:text-sm font-mono transition-all ${getTabClasses()}`}
                >
                  <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                    <span>{tab.label}</span>
                    <span className={`text-[10px] px-1 py-0.5 rounded ${getBadgeClasses()}`}>
                      {tab.count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quest List */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-1.5 sm:p-2 sm:p-4 space-y-1.5 sm:space-y-2 min-h-0 scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent" style={{ WebkitOverflowScrolling: 'touch' }}>
            {displayedQuests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="text-primary/40 text-2xl mb-4 font-mono">[NO QUESTS]</div>
                <p className="text-white/40 text-sm font-mono">
                  {hasActiveFilters 
                    ? 'Try adjusting your filters' 
                    : 'Quests will be auto-detected from conversations'}
                </p>
              </div>
            ) : (
              displayedQuests.map((quest) => (
                <button
                  key={quest.id}
                  onClick={() => setSelectedQuestId(quest.id)}
                  className={`w-full text-left p-2 sm:p-3 sm:p-4 rounded border transition-all ${
                    selectedQuestId === quest.id
                      ? 'border-primary/70 bg-primary/20 shadow-neon'
                      : `${getStatusColor(quest.status)} hover:border-primary/50 hover:bg-primary/10`
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] sm:text-xs font-mono ${getTypeColor(quest.quest_type)}`}>
                          {quest.quest_type.toUpperCase()}
                        </span>
                        {quest.source === 'extracted' && (
                          <span className="text-[8px] sm:text-[10px] text-primary/60 font-mono">[AUTO]</span>
                        )}
                      </div>
                      <h3 className="text-xs sm:text-sm sm:text-base font-bold text-white mb-1 font-mono truncate">
                        {quest.title}
                      </h3>
                      {quest.description && (
                        <p className="text-xs sm:text-sm text-white/60 line-clamp-2 mb-2">
                          {quest.description}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="relative mb-2">
                    <div className="w-full h-1.5 bg-black/60 rounded-sm overflow-hidden border border-primary/20">
                      <div
                        className="h-full bg-gradient-to-r from-primary via-secondary to-primary transition-all duration-500 shadow-[0_0_8px_rgba(154,77,255,0.4)]"
                        style={{ width: `${quest.progress_percentage}%` }}
                      />
                    </div>
                    <div className="text-[10px] sm:text-xs text-primary/60 mt-1 font-mono">
                      {Math.round(quest.progress_percentage)}% COMPLETE
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-2 sm:gap-3 sm:gap-4 text-[9px] sm:text-[10px] sm:text-xs text-white/50 font-mono">
                    <span>PRI: {quest.priority}</span>
                    <span>IMP: {quest.importance}</span>
                    <span>IMPACT: {quest.impact}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Quest Details */}
        <div className="hidden sm:flex sm:w-1/2 lg:w-3/5 min-h-0 pl-4">
          <QuestDetailPanel questId={selectedQuestId} />
        </div>
      </div>

      {/* Mobile Detail Modal - Full Screen */}
      {selectedQuestId && (
        <div 
          className="sm:hidden fixed inset-0 z-50 bg-black/95 backdrop-blur-lg flex flex-col"
        >
          {/* Header with close button */}
          <div 
            className="flex-shrink-0 flex items-center justify-between p-4 border-b border-primary/30 bg-black/80"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white font-mono">QUEST DETAILS</h2>
            <button
              type="button"
              onClick={() => {
                setSelectedQuestId(null);
              }}
              className="h-10 w-10 p-0 text-white/70 hover:text-white hover:bg-primary/20 rounded flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* Scrollable content */}
          <div 
            className="flex-1 overflow-hidden min-h-0 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <QuestDetailPanel 
              questId={selectedQuestId} 
              onClose={() => setSelectedQuestId(null)} 
            />
          </div>
        </div>
      )}
    </div>
  );
};
