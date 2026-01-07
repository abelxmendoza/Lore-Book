/**
 * Custom Tooltip for Alignment Timeline Chart
 * Displays snapshot details with disclaimer
 */

import type { AlignmentSnapshot } from '../../../hooks/useGoalsAndValues';

interface AlignmentTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: {
      timestamp: string;
      [key: string]: any;
    };
    color: string;
  }>;
  label?: string;
  goalTitle?: string;
  snapshot?: AlignmentSnapshot;
}

// Recharts Tooltip props type
interface RechartsTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: Record<string, any>;
    color: string;
  }>;
  label?: string;
}

export const AlignmentTooltip = ({ 
  active, 
  payload, 
  label
}: RechartsTooltipProps) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0];
  const alignmentScore = data.value;
  const timestamp = data.payload.timestamp || label;
  const goalName = data.name;

  // Try to get snapshot from payload metadata
  const payloadSnapshot = data.payload[`${goalName}_snapshot`] as AlignmentSnapshot | undefined;
  const effectiveSnapshot = payloadSnapshot;

  // If we have a snapshot, use its data
  const confidence = effectiveSnapshot?.confidence || 0.5;
  const signalCount = effectiveSnapshot?.metadata?.signal_count || 0;
  const summary = effectiveSnapshot?.metadata?.summary || 'Alignment calculated from recent actions';

  const getAlignmentLabel = (score: number) => {
    if (score >= 0.3) return 'Aligned';
    if (score >= -0.3) return 'Neutral';
    return 'Misaligned';
  };

  const getAlignmentColor = (score: number) => {
    if (score >= 0.3) return 'text-green-400';
    if (score >= -0.3) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="bg-black/95 border border-primary/30 rounded-lg p-4 shadow-xl min-w-[280px]">
      <div className="space-y-3">
        {/* Goal Title */}
        {goalName && (
          <div>
            <h4 className="text-sm font-semibold text-white mb-1">{goalName}</h4>
          </div>
        )}

        {/* Date */}
        {timestamp && (
          <div className="text-xs text-white/60">
            {new Date(timestamp).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              year: 'numeric' 
            })}
          </div>
        )}

        {/* Alignment Score */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/70">Alignment Score</span>
          <span className={`text-sm font-bold ${getAlignmentColor(alignmentScore)}`}>
            {getAlignmentLabel(alignmentScore)} ({Math.round(alignmentScore * 100)}%)
          </span>
        </div>

        {/* Confidence */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/70">Confidence</span>
          <span className="text-xs text-white/60">
            {Math.round(confidence * 100)}%
          </span>
        </div>

        {/* Contributing Signals */}
        {signalCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/70">Signals</span>
            <span className="text-xs text-white/60">
              {signalCount} contributing
            </span>
          </div>
        )}

        {/* Explanation */}
        {summary && (
          <div className="pt-2 border-t border-white/10">
            <p className="text-xs text-white/80 leading-relaxed">{summary}</p>
          </div>
        )}

        {/* Disclaimer */}
        <div className="pt-2 border-t border-white/10">
          <p className="text-xs text-yellow-400/80 italic">
            Observed alignment, not intent
          </p>
        </div>
      </div>
    </div>
  );
};

