/**
 * Query Suggestions Component
 * 
 * Provides intelligent query suggestions as user types
 */

import { useState, useEffect, useRef } from 'react';
import { Search, Sparkles, Clock, User, MapPin, Calendar, Award } from 'lucide-react';
import { Card, CardContent } from '../ui/card';

interface QuerySuggestion {
  query: string;
  type: 'character' | 'location' | 'event' | 'skill' | 'timeline' | 'domain' | 'general';
  icon: React.ReactNode;
}

const DEFAULT_SUGGESTIONS: QuerySuggestion[] = [
  { query: 'my full life story', type: 'general', icon: <Sparkles className="h-4 w-4" /> },
  { query: 'my story with', type: 'character', icon: <User className="h-4 w-4" /> },
  { query: 'everything at', type: 'location', icon: <MapPin className="h-4 w-4" /> },
  { query: 'my fighting journey', type: 'skill', icon: <Award className="h-4 w-4" /> },
  { query: 'my 2020 story', type: 'timeline', icon: <Clock className="h-4 w-4" /> },
  { query: 'the wedding story', type: 'event', icon: <Calendar className="h-4 w-4" /> },
];

interface QuerySuggestionsProps {
  query: string;
  onSelect: (query: string) => void;
  characters?: Array<{ id: string; name: string }>;
  locations?: Array<{ id: string; name: string }>;
  skills?: Array<{ id: string; name: string }>;
}

export const QuerySuggestions = ({ query, onSelect, characters = [], locations = [], skills = [] }: QuerySuggestionsProps) => {
  const [suggestions, setSuggestions] = useState<QuerySuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions(DEFAULT_SUGGESTIONS);
      setShowSuggestions(true);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered: QuerySuggestion[] = [];

    // Character suggestions
    if (lowerQuery.includes('with') || lowerQuery.includes('story') || lowerQuery.includes('about')) {
      characters.slice(0, 3).forEach(char => {
        filtered.push({
          query: `my story with ${char.name}`,
          type: 'character',
          icon: <User className="h-4 w-4" />,
        });
      });
    }

    // Location suggestions
    if (lowerQuery.includes('at') || lowerQuery.includes('in') || lowerQuery.includes('location')) {
      locations.slice(0, 3).forEach(loc => {
        filtered.push({
          query: `everything at ${loc.name}`,
          type: 'location',
          icon: <MapPin className="h-4 w-4" />,
        });
      });
    }

    // Skill suggestions
    if (lowerQuery.includes('journey') || lowerQuery.includes('learning') || lowerQuery.includes('my')) {
      skills.slice(0, 3).forEach(skill => {
        filtered.push({
          query: `my ${skill.name} journey`,
          type: 'skill',
          icon: <Award className="h-4 w-4" />,
        });
      });
    }

    // Timeline suggestions
    if (lowerQuery.includes('year') || lowerQuery.includes('story') || lowerQuery.includes('when')) {
      const currentYear = new Date().getFullYear();
      for (let i = 0; i < 3; i++) {
        const year = currentYear - i;
        filtered.push({
          query: `my ${year} story`,
          type: 'timeline',
          icon: <Clock className="h-4 w-4" />,
        });
      }
    }

    // Domain suggestions
    if (lowerQuery.includes('robotics') || lowerQuery.includes('fighting') || lowerQuery.includes('relationship')) {
      ['robotics', 'fighting', 'relationships', 'creative', 'professional'].forEach(domain => {
        if (lowerQuery.includes(domain) || filtered.length < 5) {
          filtered.push({
            query: `my ${domain} journey`,
            type: 'domain',
            icon: <Sparkles className="h-4 w-4" />,
          });
        }
      });
    }

    // If no specific suggestions, show defaults
    if (filtered.length === 0) {
      setSuggestions(DEFAULT_SUGGESTIONS.slice(0, 5));
    } else {
      setSuggestions(filtered.slice(0, 8));
    }

    setShowSuggestions(filtered.length > 0 || !query.trim());
  }, [query, characters, locations, skills]);

  if (!showSuggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <Card className="absolute top-full left-0 right-0 mt-2 bg-black/90 border-border/60 z-50 max-h-[300px] overflow-y-auto">
      <CardContent className="p-2">
        <div className="space-y-1">
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => {
                onSelect(suggestion.query);
                setShowSuggestions(false);
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-black/60 transition-colors flex items-center gap-3 group"
            >
              <div className="text-primary/70 group-hover:text-primary">
                {suggestion.icon}
              </div>
              <span className="text-white/80 group-hover:text-white text-sm">
                {suggestion.query}
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
