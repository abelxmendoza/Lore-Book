import { Clock, Compass } from 'lucide-react';

import type { Insight } from './InsightCard';

export const InsightTimelineView = ({ predictions }: { predictions?: Insight[] }) => {
  if (!predictions || predictions.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-black/40 p-4 text-sm text-white/50">
        No predictions yet. Generate insights to see future arcs.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-gradient-to-r from-primary/10 via-slate-900/70 to-black p-5">
      <div className="flex items-center gap-2 text-white">
        <Compass className="h-5 w-5 text-primary" />
        <div>
          <p className="text-xs uppercase text-white/50">Forecast</p>
          <p className="text-lg font-semibold">Predicted arcs</p>
        </div>
      </div>

      <div className="space-y-2">
        {predictions.map((prediction) => (
          <div
            key={prediction.description}
            className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-white"
          >
            <div>
              <p className="text-sm font-semibold">{prediction.pattern ?? prediction.motif ?? 'Emerging arc'}</p>
              <p className="text-xs text-white/70">{prediction.description}</p>
            </div>
            <div className="flex items-center gap-2 text-primary">
              <Clock className="h-4 w-4" />
              <span className="text-xs uppercase">{prediction.horizon ?? 'soon'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
