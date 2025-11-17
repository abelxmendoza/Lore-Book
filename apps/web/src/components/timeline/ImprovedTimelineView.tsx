import { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar, Filter, Search, ChevronRight, Clock, BookOpen, Tag as TagIcon, Users, CheckSquare, Sparkles, List, Grid, Layers } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader } from '../ui/card';
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
  const [dateFilter, setDateFilter] = useState<'all' | 'week' | 'month' | 'year'>('all');
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
    if (!searchTerm && dateFilter === 'all') return timeline;

    const now = new Date();
    const filterDate = (() => {
      switch (dateFilter) {
        case 'week':
          return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        case 'month':
          return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        case 'year':
          return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        default:
          return null;
      }
    })();

    const filterEntry = (entry: any) => {
      const matchesSearch = !searchTerm || 
        entry.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.summary?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDate = !filterDate || new Date(entry.date) >= filterDate;
      return matchesSearch && matchesDate;
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
  }, [timeline, searchTerm, dateFilter]);

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
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

        {/* Search and Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 flex items-center gap-2 min-w-[200px]">
            <Search className="h-4 w-4 text-white/40" />
            <Input
              type="text"
              placeholder="Search timeline entries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-black/60 border-border/50 text-white placeholder:text-white/40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-white/40" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="rounded-lg border border-border/50 bg-black/60 px-3 py-2 text-sm text-white"
            >
              <option value="all">All Time</option>
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="year">Last Year</option>
            </select>
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
                    <Button size="sm" onClick={onCreateChapter}>
                      New Chapter
                    </Button>
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
                    <Button size="sm" onClick={onCreateChapter}>
                      Create Your First Chapter
                    </Button>
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
          {chapterCandidates.length > 0 && (
            <Card className="bg-black/40 border-border/60">
              <CardHeader>
                <h3 className="text-lg font-semibold">Suggested Chapters</h3>
                <p className="text-sm text-white/60 mt-2">
                  AI-detected potential chapters based on your entries
                </p>
              </CardHeader>
              <CardContent>
                <ChapterViewer chapters={chapters} candidates={chapterCandidates} onRefresh={onRefreshChapters} />
              </CardContent>
            </Card>
          )}
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

