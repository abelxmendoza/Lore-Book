import { format, formatDistanceToNow, isValid } from 'date-fns';
import { Calendar, Clock } from 'lucide-react';
import type { TimePrecision } from '../../../utils/timeEngine';

export type DateDisplayProps = {
  date: Date | string | null | undefined;
  precision?: TimePrecision;
  showRelative?: boolean;
  showTime?: boolean;
  variant?: 'default' | 'compact' | 'detailed';
  className?: string;
};

export const DateDisplay = ({
  date,
  precision = 'day',
  showRelative = false,
  showTime = false,
  variant = 'default',
  className = ''
}: DateDisplayProps) => {
  if (!date) {
    return (
      <span className={`text-white/40 ${className}`}>
        No date
      </span>
    );
  }

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (!isValid(dateObj)) {
    return (
      <span className={`text-red-400 ${className}`}>
        Invalid date
      </span>
    );
  }

  const formatDate = () => {
    switch (precision) {
      case 'year':
        return format(dateObj, 'yyyy');
      case 'month':
        return format(dateObj, 'MMMM yyyy');
      case 'day':
        return format(dateObj, 'MMMM d, yyyy');
      case 'hour':
        return format(dateObj, 'MMMM d, yyyy h:mm a');
      case 'minute':
        return format(dateObj, 'MMMM d, yyyy h:mm a');
      case 'second':
        return format(dateObj, 'MMMM d, yyyy h:mm:ss a');
      default:
        return format(dateObj, 'MMMM d, yyyy');
    }
  };

  const relativeTime = showRelative ? formatDistanceToNow(dateObj, { addSuffix: true }) : null;

  if (variant === 'compact') {
    return (
      <span className={`text-sm text-white/60 flex items-center gap-1 ${className}`}>
        <Calendar className="h-3 w-3" />
        <span>{formatDate()}</span>
        {showRelative && relativeTime && (
          <span className="text-white/40">({relativeTime})</span>
        )}
      </span>
    );
  }

  if (variant === 'detailed') {
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <div className="flex items-center gap-2 text-white/80">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="font-medium">{formatDate()}</span>
        </div>
        {showRelative && relativeTime && (
          <div className="flex items-center gap-2 text-sm text-white/50 ml-6">
            <Clock className="h-3 w-3" />
            <span>{relativeTime}</span>
          </div>
        )}
        {precision !== 'day' && (
          <span className="text-xs text-white/40 ml-6">
            Precision: {precision}
          </span>
        )}
      </div>
    );
  }

  // Default variant
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Calendar className="h-4 w-4 text-primary" />
      <span className="text-white/80">{formatDate()}</span>
      {showRelative && relativeTime && (
        <span className="text-sm text-white/50">({relativeTime})</span>
      )}
    </div>
  );
};

