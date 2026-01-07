import { TrendingDown, TrendingUp, Minus, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { InsightCard } from '../InsightCard';
import type { DriftObservation } from '../../../hooks/useGoalsAndValues';

interface DriftSectionProps {
  driftObservations: DriftObservation[];
}

export const DriftSection = ({ driftObservations }: DriftSectionProps) => {
  if (driftObservations.length === 0) {
    return null;
  }

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-yellow-400" />
          <CardTitle className="text-lg font-semibold text-white">Observed Drift</CardTitle>
        </div>
        <CardDescription className="text-white/60">
          Neutral observations of alignment changes over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {driftObservations.map((drift, idx) => {
            const TrendIcon = 
              drift.trend === 'downward' ? TrendingDown :
              drift.trend === 'upward' ? TrendingUp :
              Minus;
            
            const trendColor = 
              drift.trend === 'downward' ? 'text-yellow-400' :
              drift.trend === 'upward' ? 'text-green-400' :
              'text-white/60';

            return (
              <div key={idx} className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <TrendIcon className={`h-5 w-5 ${trendColor} flex-shrink-0 mt-0.5`} />
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-white mb-1">{drift.title}</h4>
                    <p className="text-sm text-white/80 mb-2">{drift.description}</p>
                    <p className="text-xs text-yellow-400/80 italic">{drift.disclaimer}</p>
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

