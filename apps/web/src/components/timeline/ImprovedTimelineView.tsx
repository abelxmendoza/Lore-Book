import { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar, Filter, Search, ChevronRight, Clock, BookOpen, Tag as TagIcon, Users, CheckSquare, Sparkles, List, Grid, Layers } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Badge } from '../ui/badge';
import { ChaptersList } from '../ChaptersList';
import { MemoryTimeline } from '../MemoryTimeline';
import { TaskEnginePanel } from '../TaskEnginePanel';
import { TagCloud } from '../TagCloud';
import { ChapterViewer } from '../ChapterViewer';
import { TimelineGraph } from './TimelineGraph';
import { ColorCodedTimeline } from './ColorCodedTimeline';
import { TimelineCardView } from './TimelineCardView';
import { TimelineEntryModal } from './TimelineEntryModal';
import type { TimelineResponse } from '../../hooks/useLoreKeeper';
import { fetchJson } from '../../lib/api';

type TimelineViewProps = {
  timeline: TimelineResponse;
  chapters: any[];
  chapterCandidates: any[];
  tags: Array<{ tag: string; count: number }>;
  taskList: any[];
  taskEvents: any[];
  taskBriefing: any;
  loading: boolean;
  onCreateChapter: () => void;
  onSummarizeChapter: (chapterId: string) => Promise<void>;
  onCreateTask: (payload: any) => Promise<void>;
  onCompleteTask: (id: string) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onProcessChat: (command: string) => Promise<void>;
  onSyncMicrosoft: () => Promise<void>;
  onRefreshChapters: () => Promise<void>;
};

type ViewMode = 'graph' | 'chapters' | 'tasks' | 'overview';
type DensityMode = 'detailed' | 'summary' | 'chapters';

export const ImprovedTimelineView = ({
  timeline,
  chapters,
  chapterCandidates,
  tags,
  taskList,
  taskEvents,
  taskBriefing,
  loading,
  onCreateChapter,
  onSummarizeChapter,
  onCreateTask,
  onCompleteTask,
  onDeleteTask,
  onProcessChat,
  onSyncMicrosoft,
  onRefreshChapters
}: TimelineViewProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>('overview'); // Default to overview dashboard
  const [density, setDensity] = useState<DensityMode>('detailed');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'week' | 'month' | 'year' | 'custom'>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [customDateRange, setCustomDateRange] = useState<{ from: string; to: string } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [memoirSections, setMemoirSections] = useState<Array<{ id: string; title: string; period?: { from: string; to: string } }>>([]);
  const [currentTimelineItem, setCurrentTimelineItem] = useState<string | undefined>();
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load memoir sections for the timeline
    const loadMemoirSections = async () => {
      try {
        const data = await fetchJson<{ sections: Array<{ id: string; title: string; period?: { from: string; to: string } }> }>('/api/memoir/outline');
        setMemoirSections(data.sections || []);
      } catch (error) {
        console.error('Failed to load memoir sections:', error);
      }
    };
    loadMemoirSections();
  }, []);

  const filteredTimeline = useMemo(() => {
    const hasFilters = searchTerm || dateFilter !== 'all' || selectedTags.length > 0 || selectedCharacters.length > 0;
    if (!hasFilters) return timeline;

    const now = new Date();
    let filterDateFrom: Date | null = null;
    let filterDateTo: Date | null = null;

    if (dateFilter === 'custom' && customDateRange) {
      filterDateFrom = new Date(customDateRange.from);
      filterDateTo = new Date(customDateRange.to);
    } else {
      switch (dateFilter) {
        case 'week':
          filterDateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          filterDateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          filterDateFrom = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
      }
    }

    const filterEntry = (entry: any) => {
      // Search filter
      const matchesSearch = !searchTerm || 
        entry.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.summary?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Date filter
      const entryDate = new Date(entry.date);
      const matchesDate = (!filterDateFrom || entryDate >= filterDateFrom) &&
                         (!filterDateTo || entryDate <= filterDateTo);
      
      // Tag filter
      const matchesTags = selectedTags.length === 0 || 
        selectedTags.every(tag => entry.tags?.includes(tag));
      
      // Character filter (check if entry mentions selected characters)
      const matchesCharacters = selectedCharacters.length === 0 ||
        selectedCharacters.some(char => 
          entry.content?.toLowerCase().includes(char.toLowerCase()) ||
          entry.characters?.includes(char)
        );
      
      return matchesSearch && matchesDate && matchesTags && matchesCharacters;
    };

    return {
      ...timeline,
      chapters: timeline.chapters.map(chapter => ({
        ...chapter,
        months: chapter.months.map(month => ({
          ...month,
          entries: month.entries.filter(filterEntry)
        })).filter(month => month.entries.length > 0)
      })).filter(chapter => chapter.months.length > 0),
      unassigned: timeline.unassigned.map(group => ({
        ...group,
        entries: group.entries.filter(filterEntry)
      })).filter(group => group.entries.length > 0)
    };
  }, [timeline, searchTerm, dateFilter, selectedTags, selectedCharacters, customDateRange]);

  const handleEditChapter = async (chapterId: string, newTitle: string) => {
    try {
      await fetchJson('/api/naming/chapter-name', {
        method: 'PATCH',
        body: JSON.stringify({ chapterId, title: newTitle })
      });
      onRefreshChapters();
    } catch (error) {
      console.error('Failed to update chapter name:', error);
    }
  };

  const handleEditSaga = async (sagaId: string, newTitle: string) => {
    // Saga editing can be implemented later
    console.log('Edit saga:', sagaId, newTitle);
  };

  const viewModes: { key: ViewMode; label: string; icon: any; description: string }[] = [
    { key: 'overview', label: 'Overview', icon: Calendar, description: 'Dashboard with timeline, chapters & tags' },
    { key: 'graph', label: 'Graph', icon: Sparkles, description: 'Visual timeline graph' },
    { key: 'chapters', label: 'Chapters', icon: BookOpen, description: 'Organized by story arcs' },
    { key: 'tasks', label: 'Tasks', icon: CheckSquare, description: 'Tasks and to-dos' }
  ];

  // Flatten memoir sections for timeline
  const flattenSections = (sections: Array<{ id: string; title: string; period?: { from: string; to: string }; children?: any[] }>): Array<{ id: string; title: string; period?: { from: string; to: string } }> => {
    const result: Array<{ id: string; title: string; period?: { from: string; to: string } }> = [];
    sections.forEach(section => {
      result.push({ id: section.id, title: section.title, period: section.period });
      if (section.children && section.children.length > 0) {
        result.push(...flattenSections(section.children));
      }
    });
    return result;
  };

  const flatMemoirSections = flattenSections(memoirSections);

  // Extract entries from timeline for the color-coded timeline
  const timelineEntries = useMemo(() => {
    const entries: Array<{ id: string; content: string; date: string; chapter_id?: string | null }> = [];
    timeline.chapters.forEach(chapter => {
      chapter.months.forEach(month => {
        month.entries.forEach(entry => {
          entries.push({
            id: entry.id,
            content: entry.content || entry.summary || '',
            date: entry.date,
            chapter_id: chapter.id
          });
        });
      });
    });
    timeline.unassigned.forEach(group => {
      group.entries.forEach(entry => {
        entries.push({
          id: entry.id,
          content: entry.content || entry.summary || '',
          date: entry.date,
          chapter_id: null
        });
      });
    });
    return entries;
  }, [timeline]);

  // Handle timeline item click
  const handleTimelineItemClick = (item: { id: string; type: string; entryId?: string; chapterId?: string }) => {
    setCurrentTimelineItem(item.id);
    
    if (item.type === 'entry' && item.entryId) {
      // Open entry modal
      setSelectedEntryId(item.entryId);
      setIsModalOpen(true);
    } else if (item.type === 'chapter' && item.chapterId) {
      // Scroll to chapter in the timeline view
      scrollToChapter(item.chapterId);
    }
  };

  // Scroll to a specific chapter in the timeline
  const scrollToChapter = (chapterId: string) => {
    if (timelineScrollRef.current) {
      const chapterElement = timelineScrollRef.current.querySelector(`[data-chapter-id="${chapterId}"]`);
      if (chapterElement) {
        chapterElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // Handle entry click from card view
  const handleEntryClick = (entryId: string) => {
    setSelectedEntryId(entryId);
    setIsModalOpen(true);
    // Update timeline item highlight
    setCurrentTimelineItem(`entry-${entryId}`);
  };

  // Handle modal navigation
  const handleModalNavigate = (entryId: string) => {
    setSelectedEntryId(entryId);
    setCurrentTimelineItem(`entry-${entryId}`);
  };

  return (
    <div className="space-y-6" ref={timelineScrollRef}>
      {/* Color-Coded Timeline */}
      <ColorCodedTimeline
        chapters={chapters}
        sections={flatMemoirSections}
        entries={timelineEntries}
        currentItemId={currentTimelineItem}
        onItemClick={handleTimelineItemClick}
      />

      {/* Header with view modes */}
      <div className="rounded-2xl border border-border/60 bg-black/40 p-4 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-semibold">Timeline</h2>
            <p className="text-sm text-white/60 mt-1">
              {timeline.chapters.length} chapters · {timeline.unassigned.reduce((sum, g) => sum + g.entries.length, 0)} unassigned entries
            </p>
          </div>
          <Button onClick={onCreateChapter} leftIcon={<BookOpen className="h-4 w-4" />}>
            New Chapter
          </Button>
        </div>

        {/* View Mode Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4">
          {viewModes.map((mode) => {
            const Icon = mode.icon;
            return (
              <button
                key={mode.key}
                onClick={() => setViewMode(mode.key)}
                className={`flex items-center gap-2 p-3 rounded-lg border transition ${
                  viewMode === mode.key
                    ? 'border-primary bg-primary/10 text-white'
                    : 'border-border/50 bg-black/40 text-white/70 hover:border-primary/50 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <div className="text-left">
                  <div className="text-sm font-medium">{mode.label}</div>
                  <div className="text-xs text-white/50">{mode.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Search and Filters - Enhanced */}
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                type="text"
                placeholder="Search timeline..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-black/40 border-border/60 text-white"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="border-border/60"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {(selectedTags.length > 0 || selectedCharacters.length > 0 || dateFilter !== 'all') && (
                <span className="ml-2 px-1.5 py-0.5 bg-primary/20 text-primary text-xs rounded">
                  {[selectedTags.length, selectedCharacters.length, dateFilter !== 'all' ? 1 : 0].reduce((a, b) => a + b, 0)}
                </span>
              )}
            </Button>
          </div>

          {/* Advanced Filters Panel */}
          {showFilters && (
            <Card className="bg-black/40 border-border/60 p-4">
              <div className="space-y-4">
                {/* Date Range Filter */}
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Date Range</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={dateFilter}
                      onChange={(e) => {
                        setDateFilter(e.target.value as any);
                        if (e.target.value !== 'custom') {
                          setCustomDateRange(null);
                        }
                      }}
                      className="flex-1 px-3 py-2 bg-black/60 border border-border/60 rounded-lg text-white text-sm focus:outline-none focus:border-primary/50"
                    >
                      <option value="all">All Time</option>
                      <option value="week">Last Week</option>
                      <option value="month">Last Month</option>
                      <option value="year">Last Year</option>
                      <option value="custom">Custom Range</option>
                    </select>
                  </div>
                  {dateFilter === 'custom' && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        type="date"
                        value={customDateRange?.from || ''}
                        onChange={(e) => setCustomDateRange(prev => ({ ...prev, from: e.target.value, to: prev?.to || '' }))}
                        className="flex-1 bg-black/60 border-border/60 text-white"
                      />
                      <span className="text-white/60">to</span>
                      <Input
                        type="date"
                        value={customDateRange?.to || ''}
                        onChange={(e) => setCustomDateRange(prev => ({ ...prev, to: e.target.value, from: prev?.from || '' }))}
                        className="flex-1 bg-black/60 border-border/60 text-white"
                      />
                    </div>
                  )}
                </div>

                {/* Tag Filter */}
                {tags.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-white/80 mb-2 block">Tags</label>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                      {tags.map((tag) => {
                        const isSelected = selectedTags.includes(tag.tag);
                        return (
                          <Badge
                            key={tag.tag}
                            variant={isSelected ? 'default' : 'outline'}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-primary/20 text-primary border-primary/40'
                                : 'border-border/60 text-white/70 hover:bg-primary/10'
                            }`}
                            onClick={() => {
                              setSelectedTags(prev =>
                                isSelected
                                  ? prev.filter(t => t !== tag.tag)
                                  : [...prev, tag.tag]
                              );
                            }}
                          >
                            #{tag.tag} ({tag.count})
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Character Filter */}
                <div>
                  <label className="text-sm font-medium text-white/80 mb-2 block">Characters</label>
                  <Input
                    type="text"
                    placeholder="Type character names..."
                    className="bg-black/60 border-border/60 text-white"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                        const char = e.currentTarget.value.trim();
                        if (!selectedCharacters.includes(char)) {
                          setSelectedCharacters(prev => [...prev, char]);
                        }
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                  {selectedCharacters.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedCharacters.map((char) => (
                        <Badge
                          key={char}
                          variant="default"
                          className="bg-primary/20 text-primary border-primary/40 cursor-pointer"
                          onClick={() => setSelectedCharacters(prev => prev.filter(c => c !== char))}
                        >
                          {char} ×
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Clear Filters */}
                {(selectedTags.length > 0 || selectedCharacters.length > 0 || dateFilter !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedTags([]);
                      setSelectedCharacters([]);
                      setDateFilter('all');
                      setCustomDateRange(null);
                    }}
                    className="w-full text-white/60 hover:text-white"
                  >
                    Clear All Filters
                  </Button>
                )}
              </div>
            </Card>
          )}
        </div>

        {viewMode === 'overview' && (
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-white/40" />
              <div className="flex rounded-lg border border-border/50 bg-black/60 overflow-hidden">
                <button
                  onClick={() => setDensity('detailed')}
                  className={`px-3 py-2 text-xs transition ${
                    density === 'detailed'
                      ? 'bg-primary/20 text-primary border-r border-border/50'
                      : 'text-white/60 hover:text-white'
                  }`}
                  title="Show all entries"
                >
                  <List className="h-3 w-3 inline mr-1" />
                  Detailed
                </button>
                <button
                  onClick={() => setDensity('summary')}
                  className={`px-3 py-2 text-xs transition ${
                    density === 'summary'
                      ? 'bg-primary/20 text-primary border-r border-border/50'
                      : 'text-white/60 hover:text-white'
                  }`}
                  title="Show summaries only"
                >
                  <Grid className="h-3 w-3 inline mr-1" />
                  Summary
                </button>
                <button
                  onClick={() => setDensity('chapters')}
                  className={`px-3 py-2 text-xs transition ${
                    density === 'chapters'
                      ? 'bg-primary/20 text-primary'
                      : 'text-white/60 hover:text-white'
                  }`}
                  title="Show chapters only"
                >
                  <BookOpen className="h-3 w-3 inline mr-1" />
                  Chapters
                </button>
              </div>
            </div>
          )}
      </div>

      {/* Content based on view mode */}
      {viewMode === 'graph' && (
        <Card className="bg-black/40 border-border/60">
          <CardHeader>
            <h3 className="text-lg font-semibold">Timeline Graph</h3>
            <p className="text-sm text-white/60">Visual representation of your journey</p>
          </CardHeader>
          <CardContent>
            <div className="h-[600px] w-full">
              <TimelineGraph
                timeline={filteredTimeline}
                onEditChapter={handleEditChapter}
                onEditSaga={handleEditSaga}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <Card className="bg-black/40 border-border/60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    Timeline Entries
                  </h3>
                </div>
              </CardHeader>
              <CardContent>
                <TimelineCardView
                  timeline={filteredTimeline}
                  density={density}
                  onEntryClick={handleEntryClick}
                />
              </CardContent>
            </Card>
            {chapters.length > 0 && (
              <Card className="bg-black/40 border-border/60">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" />
                      Story Chapters
                    </h3>
                  </div>
                </CardHeader>
                <CardContent>
                  <ChaptersList
                    timeline={filteredTimeline}
                    onCreateClick={onCreateChapter}
                    onSummarize={onSummarizeChapter}
                  />
                </CardContent>
              </Card>
            )}
            {chapters.length === 0 && (
              <Card className="bg-black/40 border-border/60">
                <CardHeader>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    Story Chapters
                  </h3>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-white/60">
                    <BookOpen className="h-12 w-12 mx-auto mb-4 text-white/20" />
                    <p className="text-sm mb-4">No chapters yet</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          <div className="space-y-6">
            {tags.length > 0 && (
              <Card className="bg-black/40 border-border/60">
                <CardHeader>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <TagIcon className="h-5 w-5 text-primary" />
                    Topics
                  </h3>
                </CardHeader>
                <CardContent>
                  <TagCloud tags={tags} />
                </CardContent>
              </Card>
            )}
            {taskList.length > 0 && (
              <Card className="bg-black/40 border-border/60">
                <CardHeader>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <CheckSquare className="h-5 w-5 text-primary" />
                    Tasks
                  </h3>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {taskList.slice(0, 5).map((task) => (
                      <div key={task.id} className="flex items-center gap-2 p-2 rounded border border-border/50 bg-black/40">
                        <input
                          type="checkbox"
                          checked={task.completed || false}
                          onChange={() => {
                            if (task.completed) {
                              // If you want to uncomplete, you'd need an onUncomplete handler
                              // For now, just toggle completion
                            } else {
                              onCompleteTask(task.id);
                            }
                          }}
                          className="h-4 w-4 rounded border-border/50"
                        />
                        <span className={`text-sm flex-1 ${task.completed ? 'line-through text-white/40' : 'text-white/80'}`}>
                          {task.title || task.name || 'Untitled Task'}
                        </span>
                      </div>
                    ))}
                    {taskList.length > 5 && (
                      <Button variant="ghost" size="sm" className="w-full">
                        View all {taskList.length} tasks
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {viewMode === 'chapters' && (
        <div className="space-y-6">
          {/* Chapter Candidates - Show first if available */}
          {chapterCandidates.length > 0 && (
            <Card className="bg-black/40 border-border/60 border-primary/30">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Suggested Chapters
                    </h3>
                    <p className="text-sm text-white/60 mt-2">
                      AI-detected potential chapters from your entries. Click "Create Chapter" to add them.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {chapterCandidates.map((candidate: any) => (
                    <div
                      key={candidate.id}
                      className="p-4 rounded-lg border border-primary/30 bg-primary/5 hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="font-semibold text-white mb-1">{candidate.chapter_title || candidate.title}</h4>
                          {candidate.summary && (
                            <p className="text-sm text-white/70 mb-2">{candidate.summary}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-white/50">
                            <span>
                              {new Date(candidate.start_date).toLocaleDateString()}
                              {candidate.end_date && ` - ${new Date(candidate.end_date).toLocaleDateString()}`}
                            </span>
                            {candidate.confidence && (
                              <span className="text-primary/70">
                                {Math.round(candidate.confidence * 100)}% confidence
                              </span>
                            )}
                            {candidate.entry_ids && (
                              <span>{candidate.entry_ids.length} entries</span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              await fetchJson('/api/chapters', {
                                method: 'POST',
                                body: JSON.stringify({
                                  title: candidate.chapter_title || candidate.title,
                                  startDate: candidate.start_date,
                                  endDate: candidate.end_date || null,
                                  description: candidate.summary || null
                                })
                              });
                              onRefreshChapters();
                            } catch (error) {
                              console.error('Failed to create chapter:', error);
                              alert('Failed to create chapter. Please try again.');
                            }
                          }}
                        >
                          Create Chapter
                        </Button>
                      </div>
                      {candidate.chapter_traits && candidate.chapter_traits.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {candidate.chapter_traits.map((trait: string) => (
                            <Badge key={trait} variant="outline" className="text-xs border-primary/30 text-primary/70">
                              {trait}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-black/40 border-border/60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Story Chapters
                </h3>
                <Button size="sm" onClick={onCreateChapter}>
                  New Chapter
                </Button>
              </div>
              <p className="text-sm text-white/60 mt-2">
                Organize your timeline into meaningful story arcs and chapters
              </p>
            </CardHeader>
            <CardContent>
              <ChaptersList
                timeline={filteredTimeline}
                onCreateClick={onCreateChapter}
                onSummarize={onSummarizeChapter}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {viewMode === 'tasks' && (
        <Card className="bg-black/40 border-border/60">
          <CardHeader>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              Tasks & To-Dos
            </h3>
          </CardHeader>
          <CardContent>
            <TaskEnginePanel
              tasks={taskList}
              events={taskEvents}
              briefing={taskBriefing}
              loading={loading}
              onCreate={onCreateTask}
              onComplete={onCompleteTask}
              onDelete={onDeleteTask}
              onChatCommand={onProcessChat}
              onSync={onSyncMicrosoft}
            />
          </CardContent>
        </Card>
      )}

      {/* Entry Detail Modal */}
      {selectedEntryId && (
        <TimelineEntryModal
          entryId={selectedEntryId}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedEntryId(null);
            setCurrentTimelineItem(undefined);
          }}
          onNavigate={handleModalNavigate}
        />
      )}
    </div>
  );
};

