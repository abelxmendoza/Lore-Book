import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import type { EvolutionEntry } from '../../../types/essence';

interface SoulEvolutionTimelineProps {
  evolution: EvolutionEntry[];
}

/**
 * SoulEvolutionTimeline - Quiet history showing growth and shifts
 * No judgment, no warnings, just continuity over time
 */
export const SoulEvolutionTimeline = ({ evolution }: SoulEvolutionTimelineProps) => {
  if (!evolution || evolution.length === 0) {
    return null;
  }

  // Show most recent 10 entries, chronological (top = recent)
  const recentEvolution = evolution.slice(-10).reverse();

  return (
    <Card className="bg-gradient-to-br from-black/50 to-black/30 border border-white/10 rounded-xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-green-400" />
          <CardTitle className="text-base font-semibold text-white">Evolution Timeline</CardTitle>
        </div>
        <p className="text-xs text-white/50 mt-1">How your essence has evolved over time</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentEvolution.map((entry, idx) => (
            <div key={idx} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-green-400 mt-1.5" />
                {idx < recentEvolution.length - 1 && (
                  <div className="w-0.5 h-full bg-white/10 mt-1" />
                )}
              </div>
              <div className="flex-1 pb-4">
                <p className="text-sm text-white leading-relaxed">{entry.changes}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-white/50">
                    {new Date(entry.date).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-white/30">•</span>
                  <span className="text-xs text-white/50 capitalize">{entry.trigger}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
