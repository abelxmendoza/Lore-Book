import { format, isValid } from 'date-fns';
import { Calendar, ArrowRight } from 'lucide-react';
import { DateDisplay } from './DateDisplay';
import type { TimePrecision } from '../../../utils/timeEngine';

export type DateRangeDisplayProps = {
  startDate: Date | string | null | undefined;
  endDate?: Date | string | null | undefined;
  precision?: TimePrecision;
  showRelative?: boolean;
  variant?: 'default' | 'compact' | 'detailed';
  className?: string;
};

export const DateRangeDisplay = ({
  startDate,
  endDate,
  precision = 'day',
  showRelative = false,
  variant = 'default',
  className = ''
}: DateRangeDisplayProps) => {
  if (!startDate) {
    return (
      <span className={`text-white/40 ${className}`}>
        No date range
      </span>
    );
  }

  const startDateObj = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const endDateObj = endDate ? (typeof endDate === 'string' ? new Date(endDate) : endDate) : null;

  if (!isValid(startDateObj)) {
    return (
      <span className={`text-red-400 ${className}`}>
        Invalid start date
      </span>
    );
  }

  if (endDateObj && !isValid(endDateObj)) {
    return (
      <span className={`text-red-400 ${className}`}>
        Invalid end date
      </span>
    );
  }

  if (!endDateObj) {
    // Single date
    return (
      <DateDisplay
        date={startDateObj}
        precision={precision}
        showRelative={showRelative}
        variant={variant}
        className={className}
      />
    );
  }

  // Date range
  if (variant === 'compact') {
    return (
      <span className={`text-sm text-white/60 flex items-center gap-1 ${className}`}>
        <Calendar className="h-3 w-3" />
        <span>{format(startDateObj, 'MMM d, yyyy')}</span>
        <ArrowRight className="h-3 w-3 text-white/40" />
        <span>{format(endDateObj, 'MMM d, yyyy')}</span>
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Calendar className="h-4 w-4 text-primary" />
      <DateDisplay
        date={startDateObj}
        precision={precision}
        showRelative={false}
        variant="default"
        className=""
      />
      <ArrowRight className="h-4 w-4 text-white/40" />
      <DateDisplay
        date={endDateObj}
        precision={precision}
        showRelative={false}
        variant="default"
        className=""
      />
    </div>
  );
};

