// =====================================================
// EVENT CONFIDENCE HISTORY
// Purpose: Show how event confidence evolved over time
// =====================================================

import { Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { format, parseISO } from 'date-fns';
import {
  epistemicColorClass,
  epistemicHistoryTitle,
  epistemicLabel,
  formatEpistemicPercent,
} from '../../lib/epistemicLabels';

interface ConfidenceSnapshot {
  id: string;
  event_id?: string;
  confidence: number;
  reason: string;
  recorded_at: string;
  metadata?: {
    old_confidence?: number;
    change_amount?: number;
  };
}

interface EventConfidenceHistoryProps {
  snapshots: ConfidenceSnapshot[];
  currentConfidence: number;
}

export const EventConfidenceHistory: React.FC<EventConfidenceHistoryProps> = ({
  snapshots,
  currentConfidence,
}) => {
  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy h:mm a');
    } catch {
      return dateString;
    }
  };

  const getConfidenceColor = epistemicColorClass;
  const getConfidenceLabel = epistemicLabel;

  const getChangeIcon = (changeAmount?: number) => {
    if (!changeAmount) return <Minus className="w-3 h-3" />;
    if (changeAmount > 0) return <TrendingUp className="w-3 h-3 text-green-400" />;
    return <TrendingDown className="w-3 h-3 text-red-400" />;
  };

  if (snapshots.length === 0) {
    return (
      <Card className="border-border/60 bg-black/40">
        <CardHeader>
          <CardTitle className="text-sm">{epistemicHistoryTitle()}</CardTitle>
          <CardDescription>No certainty changes recorded yet</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`${getConfidenceColor(currentConfidence)} border-current`}
            >
              {getConfidenceLabel(currentConfidence)} ({formatEpistemicPercent(currentConfidence)})
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Include current confidence as the latest snapshot
  const allSnapshots = [
    ...snapshots,
    {
      id: 'current',
      confidence: currentConfidence,
      reason: 'Current certainty',
      recorded_at: new Date().toISOString(),
      metadata: undefined,
    },
  ].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

  return (
    <Card className="border-border/60 bg-black/40">
      <CardHeader>
        <CardTitle className="text-sm">{epistemicHistoryTitle()}</CardTitle>
        <CardDescription>How certain LoreBook is about this event over time</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {allSnapshots.map((snapshot, idx) => {
            const prevSnapshot = idx > 0 ? allSnapshots[idx - 1] : null;
            const changeAmount = prevSnapshot
              ? snapshot.confidence - prevSnapshot.confidence
              : snapshot.metadata?.change_amount;

            return (
              <div key={snapshot.id} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      snapshot.confidence >= 0.7
                        ? 'bg-green-400'
                        : snapshot.confidence >= 0.4
                        ? 'bg-yellow-400'
                        : 'bg-red-400'
                    }`}
                  />
                  {idx < allSnapshots.length - 1 && (
                    <div className="w-px h-8 bg-border/40 mt-1" />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`${getConfidenceColor(snapshot.confidence)} border-current text-xs`}
                      >
                        {Math.round(snapshot.confidence * 100)}%
                      </Badge>
                      <span className="text-xs text-white/60">
                        {getConfidenceLabel(snapshot.confidence)}
                      </span>
                      {changeAmount && Math.abs(changeAmount) > 0.05 && (
                        <div className="flex items-center gap-1 text-xs text-white/40">
                          {getChangeIcon(changeAmount)}
                          <span>
                            {changeAmount > 0 ? '+' : ''}
                            {Math.round(changeAmount * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-white/40">
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(snapshot.recorded_at)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-white/70">{snapshot.reason}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

