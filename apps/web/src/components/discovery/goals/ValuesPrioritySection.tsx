import { useState } from 'react';
import { Heart, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { EmptyState } from '../EmptyState';
import { Badge } from '../../ui/badge';
import type { Value } from '../../../hooks/useGoalsAndValues';

interface ValuesPrioritySectionProps {
  values: Value[];
  onPriorityChange: (id: string, priority: number) => Promise<void>;
}

const ValueCard = ({ value, index, onPriorityChange }: { 
  value: Value; 
  index: number;
  onPriorityChange: (id: string, priority: number) => Promise<void>;
}) => {
  const [priority, setPriority] = useState(value.priority);
  const [updating, setUpdating] = useState(false);

  const handlePriorityChange = async (newPriority: number) => {
    setPriority(newPriority);
    setUpdating(true);
    try {
      await onPriorityChange(value.id, newPriority);
    } catch (error) {
      console.error('Failed to update priority:', error);
      setPriority(value.priority); // Revert on error
    } finally {
      setUpdating(false);
    }
  };

  // Get rank change indicator
  const lastRank = value.metadata?.last_rank;
  const currentRank = index + 1;
  const rankChange = lastRank ? lastRank - currentRank : 0;
  const rankTrend = rankChange > 0 ? 'up' : rankChange < 0 ? 'down' : 'stable';

  // Get priority change indicator (from metadata)
  const priorityHistory = value.metadata?.priority_history;
  const priorityTrend = priorityHistory && priorityHistory.length > 1
    ? priorityHistory[priorityHistory.length - 1] > priorityHistory[priorityHistory.length - 2] ? 'up' : 'down'
    : 'stable';

  return (
    <div className="border border-border/60 rounded-lg bg-black/40 p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-white/40 w-6">#{currentRank}</span>
            <h3 className="text-base font-semibold text-white">{value.name}</h3>
            <span className="text-xs font-medium text-white/60 bg-primary/20 px-2 py-0.5 rounded">
              {Math.round(priority * 100)}%
            </span>
            {rankTrend !== 'stable' && (
              <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                {rankTrend === 'up' ? (
                  <TrendingUp className="h-3 w-3 text-green-400" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-orange-400" />
                )}
                <span className="ml-1">{Math.abs(rankChange)}</span>
              </Badge>
            )}
            {priorityTrend !== 'stable' && (
              <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                {priorityTrend === 'up' ? (
                  <TrendingUp className="h-3 w-3 text-green-400" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-orange-400" />
                )}
              </Badge>
            )}
          </div>
          <p className="text-sm text-white/70">{value.description}</p>
          {value.metadata?.last_evolution_at && (
            <p className="text-xs text-white/40 mt-1">
              Last evolved: {new Date(value.metadata.last_evolution_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-white/60">Priority</label>
          <span className="text-xs font-semibold text-primary">{Math.round(priority * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={priority}
          onChange={(e) => {
            const newPriority = parseFloat(e.target.value);
            setPriority(newPriority);
          }}
          onMouseUp={(e) => {
            const newPriority = parseFloat((e.target as HTMLInputElement).value);
            void handlePriorityChange(newPriority);
          }}
          disabled={updating}
          className="w-full"
        />
        <div className="w-full bg-black/60 rounded-full h-2 mt-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-red-500/60 to-pink-500/60 transition-all duration-300"
            style={{ width: `${priority * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export const ValuesPrioritySection = ({ values, onPriorityChange }: ValuesPrioritySectionProps) => {
  if (values.length === 0) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-red-400" />
            <CardTitle className="text-lg font-semibold text-white">Values & Priority</CardTitle>
          </div>
          <CardDescription className="text-white/60">
            Your declared values and their relative importance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No Values Declared"
            description="Declare your core values to help the system understand what matters to you"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-red-400" />
          <CardTitle className="text-lg font-semibold text-white">Values & Priority</CardTitle>
        </div>
        <CardDescription className="text-white/60">
          Your declared values and their relative importance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {values.map((value, index) => (
            <ValueCard
              key={value.id}
              value={value}
              index={index}
              onPriorityChange={onPriorityChange}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

