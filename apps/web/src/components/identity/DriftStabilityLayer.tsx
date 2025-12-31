import { useState } from 'react';
import { ChevronDown, ChevronUp, Gauge } from 'lucide-react';
import { Button } from '../ui/button';

interface DriftStabilityLayerProps {
  driftScore: number;
  stability: number;
  moodVolatility: number;
}

export const DriftStabilityLayer = ({
  driftScore,
  stability,
  moodVolatility,
}: DriftStabilityLayerProps) => {
  const [expanded, setExpanded] = useState(false);

  const driftMagnitude = driftScore < 0.3 ? 'low' : driftScore < 0.6 ? 'moderate' : 'high';
  const volatilityTrend = moodVolatility < 0.4 ? 'calm' : moodVolatility < 0.7 ? 'variable' : 'volatile';

  const getDriftMessage = () => {
    if (driftScore < 0.3) {
      return 'Gradual evolution detected';
    }
    if (driftScore < 0.6) {
      return 'Moderate identity shift pattern detected';
    }
    return 'Significant identity evolution pattern detected';
  };

  const getStabilityMessage = () => {
    if (stability > 0.8) {
      return 'No identity crisis signals';
    }
    if (stability > 0.5) {
      return 'Stable core identity maintained';
    }
    return 'Identity in transition phase';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-sm font-semibold text-white/80">Drift & Stability</h3>
        <span className="text-xs text-white/40 italic">(Click to expand)</span>
      </div>
      {/* Collapsed strip */}
      <div
        className="flex items-center justify-between p-3 bg-black/40 border border-border/30 rounded-lg cursor-pointer hover:bg-black/60 transition-colors"
        onClick={() => setExpanded(!expanded)}
        title="Drift = how much your identity themes are changing. Stability = how consistent your core identity is."
      >
        <div className="flex items-center gap-3 flex-1">
          <Gauge className="h-4 w-4 text-primary" />
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-white/60">Drift: </span>
              <span className="text-white font-medium capitalize">{driftMagnitude}</span>
            </div>
            <div>
              <span className="text-white/60">Volatility: </span>
              <span className="text-white font-medium capitalize">{volatilityTrend}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-white/60">Stability: </span>
              <div className="h-2 w-16 rounded-full bg-black/60 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-primary transition-all"
                  style={{ width: `${stability * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="p-4 bg-black/20 border border-border/20 rounded-lg space-y-3 text-sm">
          <div className="space-y-2">
            <div className="text-white/80">
              {getDriftMessage()}
            </div>
            <div className="text-white/80">
              {getStabilityMessage()}
            </div>
            {driftScore > 0.4 && driftScore < 0.7 && (
              <div className="text-blue-300/80">
                Recent experimentation phase detected
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
