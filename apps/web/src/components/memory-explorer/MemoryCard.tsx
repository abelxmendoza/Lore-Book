import { useState } from 'react';
import { Calendar, ChevronDown, ChevronUp, Tag, Users, Sparkles } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { fetchJson } from '../../lib/api';
import type { MemoryCard, LinkedMemory } from '../../types/memory';

type MemoryCardProps = {
  memory: MemoryCard;
  onSelect?: (memory: MemoryCard) => void;
  showLinked?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const moodColors: Record<string, string> = {
  happy: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  sad: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  angry: 'bg-red-500/20 text-red-300 border-red-500/30',
  anxious: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  calm: 'bg-green-500/20 text-green-300 border-green-500/30',
  excited: 'bg-orange-500/20 text-orange-300 border-orange-500/30'
};

export const MemoryCardComponent = ({
  memory,
  onSelect,
  showLinked = true,
  expanded: controlledExpanded,
  onToggleExpand
}: MemoryCardProps) => {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [linkedMemories, setLinkedMemories] = useState<LinkedMemory[]>([]);
  const [loadingLinked, setLoadingLinked] = useState(false);

  const expanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const setExpanded = onToggleExpand || (() => setInternalExpanded(!internalExpanded));

  const handleToggleExpand = async () => {
    if (!expanded && linkedMemories.length === 0 && showLinked) {
      // Load linked memories
      setLoadingLinked(true);
      try {
        const response = await fetchJson<{ entries: Array<{
          id: string;
          date: string;
          content: string;
          summary?: string | null;
          tags: string[];
          chapter_id?: string | null;
          source: string;
        }> }>(`/api/entries/${memory.id}/linked`);
        const linked = response.entries.map((entry) => {
          const entryDate = new Date(entry.date);
          const memoryDate = new Date(memory.date);
          const daysDiff = Math.round((entryDate.getTime() - memoryDate.getTime()) / (1000 * 60 * 60 * 24));

          let linkType: LinkedMemory['linkType'] = 'temporal';
          let linkLabel = '';

          if (daysDiff === 0) {
            linkLabel = 'Same day';
          } else if (daysDiff > 0) {
            linkLabel = `${daysDiff} day${daysDiff > 1 ? 's' : ''} after`;
          } else {
            linkLabel = `${Math.abs(daysDiff)} day${Math.abs(daysDiff) > 1 ? 's' : ''} before`;
          }

          // Check for other link types
          if (entry.chapter_id === memory.chapterId) {
            linkType = 'arc';
            linkLabel = 'Same chapter';
          } else if (entry.tags.some(tag => memory.tags.includes(tag))) {
            linkType = 'tag';
            const sharedTag = entry.tags.find(tag => memory.tags.includes(tag));
            linkLabel = `Tagged: ${sharedTag}`;
          } else if (entry.source === memory.source) {
            linkType = 'source';
            linkLabel = `From: ${memory.source}`;
          }

          return {
            id: entry.id,
            title: entry.summary || entry.content.substring(0, 50) + '...',
            date: entry.date,
            linkType,
            linkLabel,
            daysDiff
          };
        });

        setLinkedMemories(linked);
      } catch (error) {
        console.error('Failed to load linked memories:', error);
      } finally {
        setLoadingLinked(false);
      }
    }
    setExpanded();
  };

  const moodColor = memory.mood ? moodColors[memory.mood.toLowerCase()] || 'bg-gray-500/20 text-gray-300 border-gray-500/30' : undefined;

  return (
    <Card
      className="bg-black/50 border-border/60 hover:border-primary/50 transition-all cursor-pointer group"
      onClick={() => onSelect?.(memory)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-lg">{memory.sourceIcon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-white/50">
                <Calendar className="h-3 w-3" />
                <span className="truncate">{formatDate(memory.date)}</span>
              </div>
            </div>
          </div>
          {memory.mood && (
            <Badge className={`text-xs ${moodColor}`} variant="outline">
              {memory.mood}
            </Badge>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base font-semibold text-white line-clamp-2 group-hover:text-primary transition-colors">
          {memory.title}
        </h3>

        {/* Content Preview */}
        <p className="text-sm text-white/70 line-clamp-3">
          {memory.content}
        </p>

        {/* Tags */}
        {memory.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {memory.tags.slice(0, 5).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-xs border-primary/30 text-primary/70 px-1.5 py-0"
              >
                <Tag className="h-2.5 w-2.5 mr-1" />
                {tag}
              </Badge>
            ))}
            {memory.tags.length > 5 && (
              <Badge variant="outline" className="text-xs border-border/30 text-white/50 px-1.5 py-0">
                +{memory.tags.length - 5}
              </Badge>
            )}
          </div>
        )}

        {/* Era/Saga/Arc Badge */}
        {(memory.eraTitle || memory.sagaTitle || memory.arcTitle || memory.chapterTitle) && (
          <div className="flex items-center gap-1.5 text-xs text-primary/70">
            <Sparkles className="h-3 w-3" />
            <span className="truncate">
              {memory.eraTitle || memory.sagaTitle || memory.arcTitle || memory.chapterTitle}
            </span>
          </div>
        )}

        {/* Characters */}
        {memory.characters.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-white/60">
            <Users className="h-3 w-3" />
            <span className="truncate">{memory.characters.slice(0, 3).join(', ')}</span>
            {memory.characters.length > 3 && <span className="text-white/40">+{memory.characters.length - 3}</span>}
          </div>
        )}

        {/* Linked Memories Section */}
        {showLinked && (
          <div className="border-t border-border/30 pt-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleExpand();
              }}
              className="flex items-center justify-between w-full text-xs text-white/60 hover:text-white transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Linked Memories {linkedMemories.length > 0 && `(${linkedMemories.length})`}
              </span>
              {loadingLinked ? (
                <span className="text-xs">Loading...</span>
              ) : (
                expanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )
              )}
            </button>

            {expanded && linkedMemories.length > 0 && (
              <div className="mt-2 space-y-2">
                {linkedMemories.map((linked) => (
                  <div
                    key={linked.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Navigate to linked memory - will be handled by parent via onSelect
                    }}
                    className="p-2 rounded bg-black/40 border border-border/30 hover:border-primary/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-white truncate">{linked.title}</span>
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary/70 ml-2">
                        {linked.linkLabel}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-white/40">{formatDate(linked.date)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

