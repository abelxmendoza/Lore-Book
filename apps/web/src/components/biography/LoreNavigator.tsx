import { useState } from 'react';
import { BookOpen, Users, MapPin, BookMarked, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Input } from '../ui/input';
import type { LoreNavigatorData } from '../../hooks/useLoreNavigatorData';

export type SelectedItem = {
  type: 'biography' | 'character' | 'location' | 'chapter';
  id: string;
} | null;

type LoreNavigatorProps = {
  data: LoreNavigatorData;
  selectedItem: SelectedItem;
  onSelectItem: (item: SelectedItem) => void;
};

type SectionState = {
  biography: boolean;
  characters: boolean;
  locations: boolean;
  chapters: boolean;
};

export const LoreNavigator = ({ data, selectedItem, onSelectItem }: LoreNavigatorProps) => {
  const [expanded, setExpanded] = useState<SectionState>({
    biography: true,
    characters: true,
    locations: true,
    chapters: true
  });
  const [searchTerm, setSearchTerm] = useState('');

  const toggleSection = (section: keyof SectionState) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSelect = (type: SelectedItem['type'], id: string) => {
    onSelectItem({ type, id });
  };

  // Filter items based on search term
  const filterItems = <T extends { title?: string; name?: string }>(items: T[]): T[] => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(item => 
      (item.title?.toLowerCase().includes(term)) ||
      (item.name?.toLowerCase().includes(term))
    );
  };

  const filteredBiography = filterItems(data.biography);
  const filteredCharacters = filterItems(data.characters);
  const filteredLocations = filterItems(data.locations);
  const filteredChapters = filterItems(data.chapters);

  const isSelected = (type: SelectedItem['type'], id: string) => {
    return selectedItem?.type === type && selectedItem?.id === id;
  };

  return (
    <div className="h-full flex flex-col bg-black/40 border-r border-border/50">
      {/* Search */}
      <div className="p-4 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            type="text"
            placeholder="Search lore..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-black/60 border-border/50 text-white placeholder:text-white/40"
          />
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Biography Sections */}
        <div>
          <button
            onClick={() => toggleSection('biography')}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-primary/10 rounded-lg transition-colors"
          >
            {expanded.biography ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <BookOpen className="h-4 w-4 text-primary" />
            <span>Biography</span>
            <span className="ml-auto text-xs text-white/40">{filteredBiography.length}</span>
          </button>
          {expanded.biography && (
            <div className="ml-6 mt-1 space-y-1">
              {filteredBiography
                .sort((a, b) => a.order - b.order)
                .map((section) => (
                  <button
                    key={section.id}
                    onClick={() => handleSelect('biography', section.id)}
                    className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-all duration-200 ${
                      isSelected('biography', section.id)
                        ? 'bg-primary/20 text-white border-l-2 border-primary shadow-sm shadow-primary/20'
                        : 'text-white/70 hover:bg-black/40 hover:text-white hover:translate-x-1'
                    }`}
                  >
                    {section.title}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Characters */}
        <div>
          <button
            onClick={() => toggleSection('characters')}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-primary/10 rounded-lg transition-colors"
          >
            {expanded.characters ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <Users className="h-4 w-4 text-primary" />
            <span>Characters</span>
            <span className="ml-auto text-xs text-white/40">{filteredCharacters.length}</span>
          </button>
          {expanded.characters && (
            <div className="ml-6 mt-1 space-y-1">
              {filteredCharacters.map((character) => (
                <button
                  key={character.id}
                  onClick={() => handleSelect('character', character.id)}
                  className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-all duration-200 ${
                    isSelected('character', character.id)
                      ? 'bg-primary/20 text-white border-l-2 border-primary shadow-sm shadow-primary/20'
                      : 'text-white/70 hover:bg-black/40 hover:text-white hover:translate-x-1'
                  }`}
                >
                  {character.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Locations */}
        <div>
          <button
            onClick={() => toggleSection('locations')}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-primary/10 rounded-lg transition-colors"
          >
            {expanded.locations ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <MapPin className="h-4 w-4 text-primary" />
            <span>Locations</span>
            <span className="ml-auto text-xs text-white/40">{filteredLocations.length}</span>
          </button>
          {expanded.locations && (
            <div className="ml-6 mt-1 space-y-1">
              {filteredLocations.map((location) => (
                <button
                  key={location.id}
                  onClick={() => handleSelect('location', location.id)}
                  className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-all duration-200 ${
                    isSelected('location', location.id)
                      ? 'bg-primary/20 text-white border-l-2 border-primary shadow-sm shadow-primary/20'
                      : 'text-white/70 hover:bg-black/40 hover:text-white hover:translate-x-1'
                  }`}
                >
                  {location.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chapters */}
        <div>
          <button
            onClick={() => toggleSection('chapters')}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-primary/10 rounded-lg transition-colors"
          >
            {expanded.chapters ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <BookMarked className="h-4 w-4 text-primary" />
            <span>Chapters</span>
            <span className="ml-auto text-xs text-white/40">{filteredChapters.length}</span>
          </button>
          {expanded.chapters && (
            <div className="ml-6 mt-1 space-y-1">
              {filteredChapters.map((chapter) => (
                <button
                  key={chapter.id}
                  onClick={() => handleSelect('chapter', chapter.id)}
                  className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-all duration-200 ${
                    isSelected('chapter', chapter.id)
                      ? 'bg-primary/20 text-white border-l-2 border-primary shadow-sm shadow-primary/20'
                      : 'text-white/70 hover:bg-black/40 hover:text-white hover:translate-x-1'
                  }`}
                >
                  {chapter.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

