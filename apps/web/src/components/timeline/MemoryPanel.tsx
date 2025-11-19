import { useState } from 'react';
import { X, Calendar, Tag, Users, Link2, Sparkles, Loader2, Wand2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { fetchJson } from '../../lib/api';
import type { TimelineEntry, TimelineBand } from '../../hooks/useTimelineData';

type MemoryPanelProps = {
  entry: TimelineEntry | null;
  eras: TimelineBand[];
  sagas: TimelineBand[];
  arcs: TimelineBand[];
  onClose: () => void;
  onRelatedClick?: (entryId: string) => void;
};

const moodColors: Record<string, string> = {
  happy: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  sad: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  angry: 'bg-red-500/20 text-red-300 border-red-500/30',
  anxious: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  calm: 'bg-green-500/20 text-green-300 border-green-500/30',
  excited: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  default: 'bg-gray-500/20 text-gray-300 border-gray-500/30'
};

export const MemoryPanel = ({
  entry,
  eras,
  sagas,
  arcs,
  onClose,
  onRelatedClick
}: MemoryPanelProps) => {
  const [evaluatingHighlights, setEvaluatingHighlights] = useState(false);
  const [autoTagging, setAutoTagging] = useState(false);
  const [autoTagResult, setAutoTagResult] = useState<{
    tags: string[];
    lane: string;
    confidence_scores: { tags: number; lane: number; overall: number };
  } | null>(null);

  if (!entry) return null;

  const handleReevaluateHighlights = async () => {
    setEvaluatingHighlights(true);
    try {
      const response = await fetchJson<{ scores: Record<string, number> }>(
        '/api/timeline/score-highlights',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryIds: [entry.id], useAI: true })
        }
      );
      // TODO: Update entry metadata with highlight_score
      console.log('Highlight score:', response.scores[entry.id]);
    } catch (error) {
      console.error('Failed to re-evaluate highlights:', error);
    } finally {
      setEvaluatingHighlights(false);
    }
  };

  const handleAutoTag = async () => {
    setAutoTagging(true);
    setAutoTagResult(null);
    try {
      const response = await fetchJson<{ result: {
        tags: string[];
        lane: string;
        confidence_scores: { tags: number; lane: number; overall: number };
      } }>(
        `/api/timeline/entries/${entry.id}/auto-tag`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apply: false })
        }
      );
      setAutoTagResult(response.result);
    } catch (error) {
      console.error('Failed to auto-tag:', error);
    } finally {
      setAutoTagging(false);
    }
  };

  const handleApplyAutoTags = async () => {
    if (!autoTagResult) return;
    setAutoTagging(true);
    try {
      await fetchJson(
        `/api/timeline/entries/${entry.id}/auto-tag`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apply: true })
        }
      );
      setAutoTagResult(null);
      // TODO: Refresh entry data
    } catch (error) {
      console.error('Failed to apply auto-tags:', error);
    } finally {
      setAutoTagging(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const era = entry.era ? eras.find(e => e.id === entry.era) : null;
  const saga = entry.saga ? sagas.find(s => s.id === entry.saga) : null;
  const arc = entry.arc ? arcs.find(a => a.id === entry.arc) : null;

  const moodColor = entry.mood 
    ? moodColors[entry.mood.toLowerCase()] || moodColors.default 
    : moodColors.default;

  return (
    <div
      className={`fixed right-0 top-0 h-full w-[500px] bg-gradient-to-br from-black via-purple-950/20 to-black border-l border-primary/30 shadow-2xl z-50 transition-transform duration-300 ${
        entry ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-border/60 bg-black/40">
          <h2 className="text-xl font-bold text-white">Memory Details</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoTag}
              disabled={autoTagging}
              className="text-xs"
            >
              {autoTagging ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Wand2 className="h-3 w-3 mr-1" />
              )}
              Re-tag with AI
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReevaluateHighlights}
              disabled={evaluatingHighlights}
              className="text-xs"
            >
              {evaluatingHighlights ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              Re-evaluate Highlights
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-white/70 hover:text-white"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Title */}
          <div>
            <h3 className="text-2xl font-bold text-white mb-2">{entry.title}</h3>
            <div className="flex items-center gap-2 text-white/60 text-sm">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(entry.timestamp)}</span>
            </div>
          </div>

          {/* Mood & Hierarchy Badges */}
          <div className="flex flex-wrap gap-2">
            {entry.mood && (
              <Badge className={moodColor}>{entry.mood}</Badge>
            )}
            {era && (
              <Badge variant="outline" style={{ borderColor: era.color, color: era.color }}>
                Era: {era.name}
              </Badge>
            )}
            {saga && (
              <Badge variant="outline" style={{ borderColor: saga.color, color: saga.color }}>
                Saga: {saga.name}
              </Badge>
            )}
            {arc && (
              <Badge variant="outline" style={{ borderColor: arc.color, color: arc.color }}>
                Arc: {arc.name}
              </Badge>
            )}
            <Badge variant="outline">Lane: {entry.lane}</Badge>
          </div>

          {/* Auto-Tagging Results */}
          {autoTagResult && (
            <Card className="bg-purple-950/30 border-purple-500/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">AI Tagging Suggestions</h4>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleApplyAutoTags}
                    disabled={autoTagging}
                    className="text-xs"
                  >
                    Apply
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-white/60">Lane: </span>
                    <Badge variant="outline" className="ml-1">
                      {autoTagResult.lane}
                    </Badge>
                    <span className="text-xs text-white/40 ml-2">
                      ({Math.round(autoTagResult.confidence_scores.lane * 100)}% confidence)
                    </span>
                  </div>
                  
                  <div>
                    <span className="text-xs text-white/60">Tags: </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {autoTagResult.tags.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <span className="text-xs text-white/40 mt-1 block">
                      Overall confidence: {Math.round(autoTagResult.confidence_scores.overall * 100)}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          {entry.summary && (
            <Card className="bg-black/40 border-border/60">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-white/80 mb-2">Summary</h4>
                <p className="text-white/70 text-sm leading-relaxed">{entry.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Full Text */}
          <Card className="bg-black/40 border-border/60">
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold text-white/80 mb-2">Full Content</h4>
              <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{entry.full_text}</p>
            </CardContent>
          </Card>

          {/* Tags */}
          {entry.tags.length > 0 && (
            <Card className="bg-black/40 border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold text-white/80">Tags</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {entry.tags.map((tag, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Characters */}
          {entry.character_ids.length > 0 && (
            <Card className="bg-black/40 border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold text-white/80">Characters</h4>
                </div>
                <div className="text-white/70 text-sm">
                  {entry.character_ids.length} character{entry.character_ids.length !== 1 ? 's' : ''} involved
                </div>
              </CardContent>
            </Card>
          )}

          {/* Related Entries */}
          {entry.related_entry_ids.length > 0 && (
            <Card className="bg-black/40 border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold text-white/80">Related Memories</h4>
                </div>
                <div className="space-y-2">
                  {entry.related_entry_ids.slice(0, 5).map((relatedId) => (
                    <button
                      key={relatedId}
                      onClick={() => onRelatedClick?.(relatedId)}
                      className="w-full text-left p-2 rounded bg-black/40 border border-border/30 hover:border-primary/50 transition-colors text-white/70 hover:text-white text-sm"
                    >
                      Memory {relatedId.substring(0, 8)}...
                    </button>
                  ))}
                  {entry.related_entry_ids.length > 5 && (
                    <p className="text-xs text-white/50 text-center">
                      ...and {entry.related_entry_ids.length - 5} more
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

