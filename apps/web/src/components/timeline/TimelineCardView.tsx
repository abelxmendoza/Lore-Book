import { useState, useMemo } from 'react';
import { Calendar, Clock, Tag as TagIcon, BookOpen, Sparkles, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { timeEngine } from '../../utils/timeEngine';
import { TimeDisplay } from '../time/TimeDisplay';
import type { TimelineResponse } from '../../hooks/useLoreKeeper';

type TimelineCardViewProps = {
  timeline: TimelineResponse;
  density: 'detailed' | 'summary' | 'chapters';
  onEntryClick?: (entryId: string) => void;
};

export const TimelineCardView = ({ timeline, density, onEntryClick }: TimelineCardViewProps) => {
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());

  const toggleChapter = (chapterId: string) => {
    const newExpanded = new Set(expandedChapters);
    if (newExpanded.has(chapterId)) {
      newExpanded.delete(chapterId);
    } else {
      newExpanded.add(chapterId);
    }
    setExpandedChapters(newExpanded);
  };

  // Flatten all entries for card view
  const allEntries = useMemo(() => {
    const entries: Array<{
      id: string;
      date: string;
      content: string;
      summary?: string;
      tags: string[];
      mood?: string;
      chapter_id?: string;
      chapter_title?: string;
    }> = [];

    timeline.chapters.forEach(chapter => {
      chapter.months.forEach(month => {
        month.entries.forEach(entry => {
          entries.push({
            id: entry.id,
            date: entry.date,
            content: entry.content || '',
            summary: entry.summary,
            tags: entry.tags || [],
            mood: entry.mood,
            chapter_id: chapter.id,
            chapter_title: chapter.title
          });
        });
      });
    });

    timeline.unassigned.forEach(group => {
      group.entries.forEach(entry => {
        entries.push({
          id: entry.id,
          date: entry.date,
          content: entry.content || '',
          summary: entry.summary,
          tags: entry.tags || [],
          mood: entry.mood
        });
      });
    });

    // Use TimeEngine for accurate chronological sorting
    return timeEngine.sortChronologically(
      entries.map(e => ({ timestamp: e.date, ...e }))
    ).map((item: any) => {
      const { timestamp, ...rest } = item;
      return rest;
    }).reverse(); // Most recent first
  }, [timeline]);

  // Filter entries based on density
  const displayedEntries = useMemo(() => {
    if (density === 'chapters') {
      // Only show chapter headers, no entries
      return [];
    } else if (density === 'summary') {
      // Show only entries with summaries or first entry of each month
      const monthMap = new Map<string, typeof allEntries[0]>();
      allEntries.forEach(entry => {
        const monthKey = new Date(entry.date).toISOString().slice(0, 7);
        if (!monthMap.has(monthKey) || entry.summary) {
          monthMap.set(monthKey, entry);
        }
      });
      return Array.from(monthMap.values());
    } else {
      // Show all entries
      return allEntries;
    }
  }, [allEntries, density]);

  if (density === 'chapters') {
    return (
      <div className="space-y-4">
        {timeline.chapters.map(chapter => (
          <Card 
            key={chapter.id}
            data-chapter-id={chapter.id}
            role="button"
            tabIndex={0}
            aria-label={`Chapter: ${chapter.title}`}
            aria-expanded={expandedChapters.has(chapter.id)}
            className="bg-black/40 border-border/60 hover:border-primary/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            onClick={() => toggleChapter(chapter.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleChapter(chapter.id);
              }
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-semibold text-white">{chapter.title}</h3>
                    <p className="text-xs text-white/50 mt-1">
                      {chapter.months.reduce((sum, m) => sum + m.entries.length, 0)} entries
                    </p>
                  </div>
                </div>
                <ChevronRight 
                  className={`h-5 w-5 text-white/40 transition-transform ${
                    expandedChapters.has(chapter.id) ? 'rotate-90' : ''
                  }`}
                />
              </div>
              {expandedChapters.has(chapter.id) && (
                <div className="mt-4 space-y-2">
                  {chapter.months.map(month => (
                    <div key={month.month} className="pl-8">
                      <p className="text-xs text-white/40 mb-2">{month.month}</p>
                      <div className="space-y-2">
                        {month.entries.slice(0, 3).map(entry => (
                          <div 
                            key={entry.id}
                            className="p-2 rounded border border-border/30 bg-black/40 hover:border-primary/50 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEntryClick?.(entry.id);
                            }}
                          >
                            <p className="text-sm text-white/80 line-clamp-2">
                              {entry.summary || entry.content.substring(0, 100)}...
                            </p>
                          </div>
                        ))}
                        {month.entries.length > 3 && (
                          <p className="text-xs text-white/40 pl-2">
                            +{month.entries.length - 3} more entries
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {timeline.unassigned.length > 0 && (
          <Card className="bg-black/40 border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-white/40" />
                <div>
                  <h3 className="font-semibold text-white/70">Unassigned</h3>
                  <p className="text-xs text-white/50 mt-1">
                    {timeline.unassigned.reduce((sum, g) => sum + g.entries.length, 0)} entries
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (displayedEntries.length === 0) {
    return (
      <div className="text-center py-12 text-white/60">
        <Calendar className="h-12 w-12 mx-auto mb-4 text-white/20" />
        <p className="text-lg font-medium mb-2">No timeline entries</p>
        <p className="text-sm">Start creating entries to see them here</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {displayedEntries.map(entry => (
        <Card
          key={entry.id}
          role="button"
          tabIndex={0}
          aria-label={`Entry from ${new Date(entry.date).toLocaleDateString()}: ${entry.summary || entry.content.substring(0, 50)}`}
          className="bg-black/40 border-border/60 hover:border-primary/50 transition-all hover:shadow-lg cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          onClick={() => onEntryClick?.(entry.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onEntryClick?.(entry.id);
            }
          }}
          data-testid="entry-card"
        >
          <CardContent className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Calendar className="h-4 w-4 text-primary flex-shrink-0" />
                <TimeDisplay
                  timestamp={entry.date}
                  variant="compact"
                  showIcon={false}
                  className="text-xs text-white/50 truncate"
                />
              </div>
              {entry.mood && (
                <Badge className="bg-purple-500/20 text-purple-200 text-xs flex-shrink-0">
                  {entry.mood}
                </Badge>
              )}
            </div>

            {/* Chapter Badge */}
            {entry.chapter_title && (
              <div className="flex items-center gap-2">
                <BookOpen className="h-3 w-3 text-primary/70" />
                <span className="text-xs text-primary/70 truncate">{entry.chapter_title}</span>
              </div>
            )}

            {/* Content */}
            <div className="space-y-2">
              {entry.summary && (
                <div className="p-2 rounded bg-primary/5 border border-primary/20">
                  <p className="text-xs font-semibold text-primary mb-1">Summary</p>
                  <p className="text-sm text-white/90 line-clamp-2">{entry.summary}</p>
                </div>
              )}
              <p className="text-sm text-white/80 line-clamp-3">
                {entry.summary ? entry.content.substring(0, 100) + '...' : entry.content}
              </p>
            </div>

            {/* Tags */}
            {entry.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/30">
                {entry.tags.slice(0, 3).map(tag => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="border-primary/30 text-primary/70 text-xs"
                  >
                    <TagIcon className="h-2.5 w-2.5 mr-1" />
                    {tag}
                  </Badge>
                ))}
                {entry.tags.length > 3 && (
                  <Badge variant="outline" className="border-border/30 text-white/40 text-xs">
                    +{entry.tags.length - 3}
                  </Badge>
                )}
              </div>
            )}

            {/* Hover indicator */}
            <div className="flex items-center gap-1 text-xs text-primary/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <Sparkles className="h-3 w-3" />
              <span>Click to view details</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

