import { useMemo } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { timeEngine, type TimePrecision } from '../../utils/timeEngine';
import { Badge } from '../ui/badge';

type TimeDisplayProps = {
  timestamp: Date | string;
  precision?: TimePrecision;
  showRelative?: boolean;
  showIcon?: boolean;
  className?: string;
  variant?: 'default' | 'compact' | 'detailed';
};

export const TimeDisplay = ({
  timestamp,
  precision,
  showRelative = false,
  showIcon = true,
  className = '',
  variant = 'default'
}: TimeDisplayProps) => {
  const formatted = useMemo(() => {
    return timeEngine.formatTimestamp(timestamp, precision);
  }, [timestamp, precision]);

  const relative = useMemo(() => {
    if (!showRelative) return null;
    return timeEngine.getRelativeTime(timestamp);
  }, [timestamp, showRelative]);

  const Icon = showIcon ? (precision === 'day' || !precision ? Calendar : Clock) : null;

  if (variant === 'compact') {
    return (
      <span className={`text-xs text-white/50 ${className}`}>
        {relative || formatted}
      </span>
    );
  }

  if (variant === 'detailed') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {Icon && <Icon className="h-4 w-4 text-white/40" />}
        <div className="flex flex-col">
          <span className="text-sm text-white/80">{formatted}</span>
          {relative && (
            <span className="text-xs text-white/50">{relative}</span>
          )}
        </div>
        {precision && (
          <Badge variant="outline" className="text-xs border-border/30 text-white/50">
            {precision}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {Icon && <Icon className="h-3 w-3 text-white/40" />}
      <span className="text-xs text-white/60">{formatted}</span>
      {relative && (
        <span className="text-xs text-white/40">({relative})</span>
      )}
    </div>
  );
};

