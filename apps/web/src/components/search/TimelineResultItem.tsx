/**
 * Timeline Result Item Component
 */

import { UniversalSearchResult } from './TimelineSearch';
import { format } from 'date-fns';

interface TimelineResultItemProps {
  item: UniversalSearchResult;
  onClick: () => void;
}

export const TimelineResultItem = ({ item, onClick }: TimelineResultItemProps) => {
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  return (
    <button
      className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-transparent hover:border-white/10"
      onClick={onClick}
    >
      <div className="font-medium text-white text-sm">{item.title}</div>
      {item.description && (
        <div className="text-xs text-white/60 mt-1 line-clamp-1">{item.description}</div>
      )}
      <div className="text-xs text-white/40 mt-1">{formatDate(item.date)}</div>
    </button>
  );
};

