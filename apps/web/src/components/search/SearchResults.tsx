/**
 * Categorized Search Results Component
 */

import { UniversalSearchResponse, UniversalSearchResult } from './TimelineSearch';
import { TimelineResultItem } from './TimelineResultItem';

interface SearchResultsProps {
  results: UniversalSearchResponse;
  onItemClick: (item: UniversalSearchResult) => void;
}

const categories: Array<[keyof UniversalSearchResponse, string]> = [
  ['life', 'Life Timeline'],
  ['people', 'People Timelines'],
  ['locations', 'Location Timelines'],
  ['skills', 'Skills/Hobbies'],
  ['projects', 'Project Timelines'],
  ['jobs', 'Job Timelines'],
  ['eras', 'Eras & Sagas'],
  ['arcs', 'Arcs'],
  ['sagas', 'Sagas'],
  ['relationships', 'Relationship Timelines']
];

export const SearchResults = ({ results, onItemClick }: SearchResultsProps) => {
  const hasResults = Object.values(results).some(arr => arr.length > 0);

  if (!hasResults) {
    return (
      <div className="absolute top-full mt-2 left-0 w-full bg-black/80 border border-white/10 rounded-lg p-4">
        <p className="text-sm text-white/60 text-center">No results found</p>
      </div>
    );
  }

  return (
    <div className="absolute top-full mt-2 left-0 w-full bg-black/80 backdrop-blur-sm border border-white/10 rounded-lg p-4 max-h-[60vh] overflow-y-auto space-y-6 z-50">
      {categories.map(([key, label]) => {
        const items = results[key];
        if (!items || items.length === 0) return null;

        return (
          <div key={key}>
            <h3 className="text-sm font-bold text-white/60 mb-2">
              {label} ({items.length})
            </h3>
            <div className="space-y-2">
              {items.map((item) => (
                <TimelineResultItem
                  key={item.id}
                  item={item}
                  onClick={() => onItemClick(item)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

