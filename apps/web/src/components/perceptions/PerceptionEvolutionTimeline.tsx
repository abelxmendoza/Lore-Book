import { Clock, TrendingUp, Eye, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import type { PerceptionEntry } from '../../types/perception';

interface PerceptionEvolutionTimelineProps {
  perception: PerceptionEntry;
}

/**
 * PerceptionEvolutionTimeline - Visual timeline showing how a belief evolved over time
 */
export const PerceptionEvolutionTimeline = ({ perception }: PerceptionEvolutionTimelineProps) => {
  const hasEvolution = 
    (perception.evolution_notes && perception.evolution_notes.length > 0) ||
    (perception.original_content && perception.original_content !== perception.content) ||
    perception.status !== 'unverified';

  if (!hasEvolution) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardContent className="py-8">
          <div className="text-center text-white/40">
            <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No evolution tracked yet</p>
            <p className="text-xs text-white/30 mt-1">Add notes as your understanding changes</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Build timeline events
  const timelineEvents: Array<{
    type: 'original' | 'evolution' | 'status' | 'current';
    content: string;
    date: string;
    status?: string;
  }> = [];

  // Original belief (if different from current)
  if (perception.original_content && perception.original_content !== perception.content) {
    timelineEvents.push({
      type: 'original',
      content: perception.original_content,
      date: perception.created_at,
      status: 'unverified'
    });
  }

  // Evolution notes (if they have dates in metadata, use those; otherwise use created_at + index)
  if (perception.evolution_notes && perception.evolution_notes.length > 0) {
    perception.evolution_notes.forEach((note, idx) => {
      // Try to extract date from note if it contains one, otherwise estimate
      const dateMatch = note.match(/(\d{4}-\d{2}-\d{2})/);
      const eventDate = dateMatch 
        ? dateMatch[1] 
        : new Date(new Date(perception.created_at).getTime() + (idx + 1) * 86400000).toISOString();
      
      timelineEvents.push({
        type: 'evolution',
        content: note,
        date: eventDate
      });
    });
  }

  // Status changes
  if (perception.status !== 'unverified') {
    timelineEvents.push({
      type: 'status',
      content: `Status changed to ${perception.status}`,
      date: perception.updated_at,
      status: perception.status
    });
  }

  // Current belief
  timelineEvents.push({
    type: 'current',
    content: perception.content,
    date: perception.updated_at
  });

  // Sort by date
  timelineEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'confirmed':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'disproven':
        return <XCircle className="h-4 w-4 text-red-400" />;
      case 'retracted':
        return <AlertCircle className="h-4 w-4 text-orange-400" />;
      default:
        return <Eye className="h-4 w-4 text-blue-400" />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'disproven':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'retracted':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      default:
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-semibold text-white">Belief Evolution Timeline</CardTitle>
        </div>
        <p className="text-sm text-white/60 mt-1">
          Track how your understanding changed over time
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {timelineEvents.map((event, idx) => {
            const isLast = idx === timelineEvents.length - 1;
            const isOriginal = event.type === 'original';
            const isCurrent = event.type === 'current';
            const isEvolution = event.type === 'evolution';
            const isStatus = event.type === 'status';

            return (
              <div key={idx} className="flex gap-4">
                {/* Timeline line and dot */}
                <div className="flex flex-col items-center flex-shrink-0">
                  {isOriginal ? (
                    <div className="flex-shrink-0 w-3 h-3 rounded-full bg-orange-500/60 border-2 border-orange-500 mt-1" />
                  ) : isCurrent ? (
                    <div className="flex-shrink-0 w-3 h-3 rounded-full bg-primary border-2 border-primary/50 mt-1" />
                  ) : isStatus ? (
                    <div className="flex-shrink-0 w-3 h-3 rounded-full bg-purple-500 border-2 border-purple-500/50 mt-1" />
                  ) : (
                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-400 mt-2" />
                  )}
                  {!isLast && (
                    <div className={`w-0.5 h-full mt-1 ${
                      isOriginal ? 'bg-orange-500/30' : 
                      isCurrent ? 'bg-primary/30' : 
                      'bg-white/10'
                    }`} />
                  )}
                </div>

                {/* Event content */}
                <div className="flex-1 pb-6">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      {isOriginal && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-orange-400 uppercase tracking-wider">Original Belief</span>
                          <span className="text-xs text-white/40 line-through">(superseded)</span>
                        </div>
                      )}
                      {isCurrent && (
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-primary uppercase tracking-wider">Current Belief</span>
                        </div>
                      )}
                      {isStatus && (
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusIcon(event.status)}
                          <span className="text-xs font-medium text-purple-400 uppercase tracking-wider">Status Change</span>
                          {event.status && (
                            <Badge variant="outline" className={`text-xs ${getStatusColor(event.status)}`}>
                              {event.status}
                            </Badge>
                          )}
                        </div>
                      )}
                      {isEvolution && (
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingUp className="h-3 w-3 text-blue-400" />
                          <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">Evolution Note</span>
                        </div>
                      )}
                      
                      <p className={`text-sm leading-relaxed ${
                        isOriginal ? 'text-white/50 italic line-through' : 
                        isCurrent ? 'text-white font-medium' : 
                        'text-white/80'
                      }`}>
                        {event.content}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-2">
                    <Clock className="h-3 w-3 text-white/40" />
                    <span className="text-xs text-white/50">
                      {new Date(event.date).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

