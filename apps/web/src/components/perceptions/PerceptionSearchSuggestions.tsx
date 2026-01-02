import { Search, TrendingUp, Clock, User, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';

interface PerceptionSearchSuggestionsProps {
  onSelect: (query: string) => void;
}

const suggestedSearches = [
  { query: 'Sarah', icon: User, label: 'Search: Sarah' },
  { query: 'rumor', icon: AlertTriangle, label: 'Rumors' },
  { query: 'unverified', icon: Clock, label: 'Unverified' },
  { query: 'hurt', icon: TrendingUp, label: 'Impact: hurt' },
  { query: 'overheard', icon: Search, label: 'Overheard' },
  { query: 'social media', icon: Search, label: 'Social Media' },
  { query: 'rejected', icon: TrendingUp, label: 'Impact: rejected' },
  { query: 'confirmed', icon: Clock, label: 'Confirmed' }
];

export const PerceptionSearchSuggestions = ({ onSelect }: PerceptionSearchSuggestionsProps) => {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-white/50">
        <Search className="h-3 w-3" />
        <span>Suggested searches:</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestedSearches.map((suggestion, index) => {
          const Icon = suggestion.icon;
          return (
            <button
              key={index}
              onClick={() => onSelect(suggestion.query)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/30 hover:border-orange-500/50 transition-colors"
            >
              <Icon className="h-3 w-3" />
              <span>{suggestion.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
