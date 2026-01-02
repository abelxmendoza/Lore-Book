import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { fetchJson } from '../../lib/api';
import type { MemoryFilters } from '../../types/memory';
import type { TimelineNode } from '../../types/timeline';
import type { CharacterProfile } from '../../api/characters';

type MemoryFiltersSidebarProps = {
  filters: MemoryFilters;
  onFiltersChange: (filters: MemoryFilters) => void;
};

const SOURCE_OPTIONS = [
  { value: 'journal', label: 'Journal' },
  { value: 'x', label: 'X/Twitter' },
  { value: 'task', label: 'Tasks' },
  { value: 'photo', label: 'Photos' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'chat', label: 'Chat' }
];

export const MemoryFiltersSidebar = ({ filters, onFiltersChange }: MemoryFiltersSidebarProps) => {
  const [eras, setEras] = useState<TimelineNode[]>([]);
  const [sagas, setSagas] = useState<TimelineNode[]>([]);
  const [arcs, setArcs] = useState<TimelineNode[]>([]);
  const [characters, setCharacters] = useState<CharacterProfile[]>([]);
  const [tags, setTags] = useState<Array<{ name: string; count: number }>>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['sources', 'tags']));

  useEffect(() => {
    loadFilterOptions();
  }, []);

  const loadFilterOptions = async () => {
    try {
      // Load timeline hierarchy
      const [erasRes, sagasRes, arcsRes, charactersRes, tagsRes] = await Promise.all([
        fetchJson<{ results: TimelineNode[] }>('/api/timeline-hierarchy/search', {
          method: 'POST',
          body: JSON.stringify({ layer_type: ['era'] })
        }).catch(() => ({ results: [] })),
        fetchJson<{ results: TimelineNode[] }>('/api/timeline-hierarchy/search', {
          method: 'POST',
          body: JSON.stringify({ layer_type: ['saga'] })
        }).catch(() => ({ results: [] })),
        fetchJson<{ results: TimelineNode[] }>('/api/timeline-hierarchy/search', {
          method: 'POST',
          body: JSON.stringify({ layer_type: ['arc'] })
        }).catch(() => ({ results: [] })),
        fetchJson<{ characters: CharacterProfile[] }>('/api/characters/list').catch(() => ({ characters: [] })),
        fetchJson<Array<{ name: string; count: number }>>('/api/entries?limit=500').then(async (entries: any) => {
          const tagMap = new Map<string, number>();
          (entries.entries || []).forEach((entry: any) => {
            (entry.tags || []).forEach((tag: string) => {
              tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
            });
          });
          return Array.from(tagMap.entries()).map(([name, count]) => ({ name, count }));
        }).catch(() => [])
      ]);

      setEras(erasRes.results || []);
      setSagas(sagasRes.results || []);
      setArcs(arcsRes.results || []);
      setCharacters(charactersRes.characters || []);
      setTags(tagsRes);
    } catch (error) {
      console.error('Failed to load filter options:', error);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const toggleFilter = (type: keyof MemoryFilters, value: string) => {
    const current = filters[type] as string[];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    
    onFiltersChange({
      ...filters,
      [type]: updated
    });
  };

  const clearFilters = () => {
    onFiltersChange({
      eras: [],
      sagas: [],
      arcs: [],
      characters: [],
      sources: [],
      tags: []
    });
  };

  const activeFilterCount = Object.values(filters).reduce((sum, arr) => {
    return sum + (Array.isArray(arr) ? arr.length : 0);
  }, 0);

  const renderSection = (title: string, sectionKey: string, children: React.ReactNode) => {
    const isExpanded = expandedSections.has(sectionKey);
    return (
      <div className="border-b border-border/30 pb-3 mb-3">
        <button
          onClick={() => toggleSection(sectionKey)}
          className="flex items-center justify-between w-full text-sm font-medium text-white mb-2"
        >
          <span>{title}</span>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {isExpanded && <div className="space-y-2">{children}</div>}
      </div>
    );
  };

  return (
    <div className="w-64 border-r border-border/60 bg-black/20 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Filters</h3>
        {activeFilterCount > 0 && (
          <Badge variant="outline" className="bg-primary/20 text-primary">
            {activeFilterCount}
          </Badge>
        )}
      </div>

      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="w-full mb-4 text-xs"
        >
          <X className="h-3 w-3 mr-1" />
          Clear All
        </Button>
      )}

      {renderSection('Eras', 'eras', (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {eras.length === 0 ? (
            <p className="text-xs text-white/50">No eras found</p>
          ) : (
            eras.map((era) => (
              <label key={era.id} className="flex items-center gap-2 text-xs text-white/70 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={filters.eras.includes(era.id)}
                  onChange={() => toggleFilter('eras', era.id)}
                  className="rounded border-border/50"
                />
                <span className="truncate">{era.title}</span>
              </label>
            ))
          )}
        </div>
      ))}

      {renderSection('Sagas', 'sagas', (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {sagas.length === 0 ? (
            <p className="text-xs text-white/50">No sagas found</p>
          ) : (
            sagas.map((saga) => (
              <label key={saga.id} className="flex items-center gap-2 text-xs text-white/70 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={filters.sagas.includes(saga.id)}
                  onChange={() => toggleFilter('sagas', saga.id)}
                  className="rounded border-border/50"
                />
                <span className="truncate">{saga.title}</span>
              </label>
            ))
          )}
        </div>
      ))}

      {renderSection('Arcs', 'arcs', (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {arcs.length === 0 ? (
            <p className="text-xs text-white/50">No arcs found</p>
          ) : (
            arcs.map((arc) => (
              <label key={arc.id} className="flex items-center gap-2 text-xs text-white/70 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={filters.arcs.includes(arc.id)}
                  onChange={() => toggleFilter('arcs', arc.id)}
                  className="rounded border-border/50"
                />
                <span className="truncate">{arc.title}</span>
              </label>
            ))
          )}
        </div>
      ))}

      {renderSection('Characters', 'characters', (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {characters.length === 0 ? (
            <p className="text-xs text-white/50">No characters found</p>
          ) : (
            characters.map((char) => (
              <label key={char.id} className="flex items-center gap-2 text-xs text-white/70 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={filters.characters.includes(char.id)}
                  onChange={() => toggleFilter('characters', char.id)}
                  className="rounded border-border/50"
                />
                <span className="truncate">{char.name}</span>
              </label>
            ))
          )}
        </div>
      ))}

      {renderSection('Sources', 'sources', (
        <div className="space-y-1">
          {SOURCE_OPTIONS.map((source) => (
            <label key={source.value} className="flex items-center gap-2 text-xs text-white/70 cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={filters.sources.includes(source.value)}
                onChange={() => toggleFilter('sources', source.value)}
                className="rounded border-border/50"
              />
              <span>{source.label}</span>
            </label>
          ))}
        </div>
      ))}

      {renderSection('Tags', 'tags', (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {tags.length === 0 ? (
            <p className="text-xs text-white/50">No tags found</p>
          ) : (
            tags.slice(0, 50).map((tag) => (
              <label key={tag.name} className="flex items-center gap-2 text-xs text-white/70 cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={filters.tags.includes(tag.name)}
                  onChange={() => toggleFilter('tags', tag.name)}
                  className="rounded border-border/50"
                />
                <span className="truncate">{tag.name}</span>
                <span className="text-white/40">({tag.count})</span>
              </label>
            ))
          )}
        </div>
      ))}

      {renderSection('Date Range', 'dateRange', (
        <div className="space-y-2 text-xs">
          <div>
            <label className="text-white/70 mb-1 block">From</label>
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
              className="w-full px-2 py-1 rounded bg-black/40 border border-border/50 text-white"
            />
          </div>
          <div>
            <label className="text-white/70 mb-1 block">To</label>
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
              className="w-full px-2 py-1 rounded bg-black/40 border border-border/50 text-white"
            />
          </div>
        </div>
      ))}
    </div>
  );
};

