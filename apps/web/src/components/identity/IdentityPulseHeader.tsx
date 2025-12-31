import { Clock, GitCompare } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { CardTitle, CardDescription } from '../ui/card';
import type { IdentityStatus } from '../../api/identity';

interface IdentityPulseHeaderProps {
  status: IdentityStatus;
  timeRange: string;
  onTimeRangeChange: (range: string) => void;
  compareMode: boolean;
  onCompareModeChange: (enabled: boolean) => void;
}

const STATUS_CONFIG: Record<IdentityStatus, { label: string; color: string; emoji: string }> = {
  stable: { label: 'Stable', color: 'bg-green-500/20 border-green-500/50 text-green-300', emoji: '🟢' },
  shifting: { label: 'Shifting', color: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300', emoji: '🟡' },
  exploring: { label: 'Exploring', color: 'bg-blue-500/20 border-blue-500/50 text-blue-300', emoji: '🔵' },
  turbulent: { label: 'Turbulent', color: 'bg-red-500/20 border-red-500/50 text-red-300', emoji: '🔴' },
};

const TIME_RANGES = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '6 months' },
  { value: 'all', label: 'All' },
];

export const IdentityPulseHeader = ({
  status,
  timeRange,
  onTimeRangeChange,
  compareMode,
  onCompareModeChange,
}: IdentityPulseHeaderProps) => {
  const statusConfig = STATUS_CONFIG[status];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <CardTitle className="text-xl font-semibold mb-1.5">Identity Pulse</CardTitle>
          <CardDescription className="text-sm text-white/60">
            How you see yourself right now, based on patterns in your journal entries
          </CardDescription>
          <p className="text-xs text-white/40 mt-1.5">
            This is what I see. Discuss any insight in chat to refine it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCompareModeChange(!compareMode)}
            className={compareMode ? 'text-primary' : 'text-white/60'}
            title="Compare Now vs Past"
          >
            <GitCompare className="h-4 w-4 mr-1" />
            Compare
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Badge variant="outline" className={`${statusConfig.color} text-xs`}>
          {statusConfig.emoji} {statusConfig.label}
        </Badge>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-black/40 rounded-lg p-1 border border-white/10">
            {TIME_RANGES.map((range) => (
              <button
                key={range.value}
                onClick={() => onTimeRangeChange(range.value)}
                className={`px-3 py-1 text-xs rounded transition-all ${
                  timeRange === range.value
                    ? 'bg-primary/20 text-primary font-medium'
                    : 'text-white/60 hover:text-white hover:bg-black/60'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
