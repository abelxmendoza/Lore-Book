import { useState, useCallback } from 'react';
import { Search, X, Sparkles, ZoomIn, ZoomOut, Calendar, Home, Maximize2 } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { TimelineFilters } from '../../hooks/useTimelineData';

type TimelineHeaderProps = {
  filters: TimelineFilters;
  onFiltersChange: (filters: Partial<TimelineFilters>) => void;
  onResetFilters: () => void;
  eras: Array<{ id: string; name: string }>;
  sagas: Array<{ id: string; name: string }>;
  arcs: Array<{ id: string; name: string }>;
  availableMoods: string[];
  showHeatmap?: boolean;
  onHeatmapToggle?: (enabled: boolean) => void;
  showHighlightsOnly?: boolean;
  onHighlightsToggle?: (enabled: boolean) => void;
  pixelsPerDay?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onJumpToToday?: () => void;
  onJumpToDate?: (date: Date) => void;
  entryCount?: number;
  showConnections?: boolean;
  onToggleConnections?: (enabled: boolean) => void;
};

const LANES = ['life', 'robotics', 'mma', 'work', 'creative'];

type FilterPreset = {
  id: string;
  label: string;
  filters: Partial<TimelineFilters>;
};

const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'life',
    label: 'Life',
    filters: { lane: ['life'] }
  },
  {
    id: 'robotics',
    label: 'Robotics',
    filters: { lane: ['robotics'] }
  },
  {
    id: 'mma',
    label: 'MMA',
    filters: { lane: ['mma'] }
  },
  {
    id: 'work',
    label: 'Work',
    filters: { lane: ['work'] }
  },
  {
    id: 'creative',
    label: 'Creative',
    filters: { lane: ['creative'] }
  }
];

export const TimelineHeader = ({
  filters,
  onFiltersChange,
  onResetFilters,
  eras,
  sagas,
  arcs,
  availableMoods,
  showHeatmap = false,
  onHeatmapToggle,
  showHighlightsOnly = false,
  onHighlightsToggle,
  pixelsPerDay,
  onZoomIn,
  onZoomOut,
  onJumpToToday,
  onJumpToDate,
  entryCount,
  showConnections = true,
  onToggleConnections
}: TimelineHeaderProps) => {
  const [searchTerm, setSearchTerm] = useState(filters.search || '');
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [showJumpToDate, setShowJumpToDate] = useState(false);
  const [jumpDate, setJumpDate] = useState('');

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    const timer = setTimeout(() => {
      onFiltersChange({ search: value || undefined });
    }, 300);
    
    setDebounceTimer(timer);
  }, [debounceTimer, onFiltersChange]);

  const hasActiveFilters = Boolean(
    filters.era?.length ||
    filters.saga?.length ||
    filters.arc?.length ||
    filters.lane?.length ||
    filters.mood?.length ||
    filters.search
  );

  const toggleFilter = (type: keyof TimelineFilters, value: string) => {
    const current = filters[type] as string[] | undefined;
    const newValue = current?.includes(value)
      ? current.filter(v => v !== value)
      : [...(current || []), value];
    
    onFiltersChange({ [type]: newValue.length > 0 ? newValue : undefined });
    setActivePreset(null); // Clear preset when manually filtering
  };

  const applyPreset = (preset: FilterPreset) => {
    setActivePreset(preset.id);
    onFiltersChange(preset.filters);
  };

  const handleJumpToDate = () => {
    if (jumpDate && onJumpToDate) {
      const date = new Date(jumpDate);
      if (!isNaN(date.getTime())) {
        onJumpToDate(date);
        setJumpDate('');
        setShowJumpToDate(false);
      }
    }
  };

  const getZoomLevel = () => {
    if (!pixelsPerDay) return '';
    if (pixelsPerDay < 0.5) return 'Years';
    if (pixelsPerDay < 2) return 'Months';
    if (pixelsPerDay < 10) return 'Weeks';
    return 'Days';
  };

  const activeFilterCount = 
    (filters.era?.length || 0) +
    (filters.saga?.length || 0) +
    (filters.arc?.length || 0) +
    (filters.lane?.length || 0) +
    (filters.mood?.length || 0) +
    (filters.search ? 1 : 0);

  return (
    <div className="flex-shrink-0 bg-black/40 border-b border-border/60 p-4 space-y-3">
      {/* Top Row: Search, Zoom Controls, Navigation */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            type="text"
            placeholder="Search memories..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 bg-black/40 border-border/50 text-white placeholder:text-white/40"
          />
        </div>

        {/* Zoom Controls */}
        {(onZoomIn || onZoomOut) && (
          <div className="flex items-center gap-2 border border-border/30 rounded-lg p-1 bg-black/20">
            <Button
              variant="ghost"
              size="sm"
              onClick={onZoomOut}
              className="h-8 w-8 p-0"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <div className="px-3 py-1 text-xs text-white/60 min-w-[60px] text-center">
              {pixelsPerDay ? `${getZoomLevel()}` : ''}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onZoomIn}
              className="h-8 w-8 p-0"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Navigation Controls */}
        <div className="flex items-center gap-2">
          {onJumpToToday && (
            <Button
              variant="outline"
              size="sm"
              onClick={onJumpToToday}
              className="text-xs"
              title="Jump to today (Press T)"
            >
              <Home className="h-3 w-3 mr-1" />
              Today
            </Button>
          )}
          {onJumpToDate && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowJumpToDate(!showJumpToDate)}
                className="text-xs"
              >
                <Calendar className="h-3 w-3 mr-1" />
                Jump to Date
              </Button>
              {showJumpToDate && (
                <div className="absolute top-full right-0 mt-2 bg-black/95 border border-border/50 rounded-lg p-3 shadow-xl z-50 min-w-[250px]">
                  <Input
                    type="date"
                    value={jumpDate}
                    onChange={(e) => setJumpDate(e.target.value)}
                    className="mb-2"
                    placeholder="Select date"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleJumpToDate}
                      className="flex-1 text-xs"
                    >
                      Go
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowJumpToDate(false);
                        setJumpDate('');
                      }}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Entry Count */}
        {entryCount !== undefined && (
          <div className="text-xs text-white/50 px-2">
            {entryCount} {entryCount === 1 ? 'memory' : 'memories'}
          </div>
        )}
      </div>

      {/* Active Filters Chips */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/60">Active filters:</span>
          {filters.era?.map((eraId) => {
            const era = eras.find(e => e.id === eraId);
            return era ? (
              <Badge
                key={`era-${eraId}`}
                variant="default"
                className="cursor-pointer hover:opacity-80 transition-opacity text-xs"
                onClick={() => toggleFilter('era', eraId)}
              >
                Era: {era.name}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ) : null;
          })}
          {filters.saga?.map((sagaId) => {
            const saga = sagas.find(s => s.id === sagaId);
            return saga ? (
              <Badge
                key={`saga-${sagaId}`}
                variant="default"
                className="cursor-pointer hover:opacity-80 transition-opacity text-xs"
                onClick={() => toggleFilter('saga', sagaId)}
              >
                Saga: {saga.name}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ) : null;
          })}
          {filters.arc?.map((arcId) => {
            const arc = arcs.find(a => a.id === arcId);
            return arc ? (
              <Badge
                key={`arc-${arcId}`}
                variant="default"
                className="cursor-pointer hover:opacity-80 transition-opacity text-xs"
                onClick={() => toggleFilter('arc', arcId)}
              >
                Arc: {arc.name}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ) : null;
          })}
          {filters.lane?.map((lane) => (
            <Badge
              key={`lane-${lane}`}
              variant="default"
              className="cursor-pointer hover:opacity-80 transition-opacity text-xs"
              onClick={() => toggleFilter('lane', lane)}
            >
              {lane}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
          {filters.mood?.map((mood) => (
            <Badge
              key={`mood-${mood}`}
              variant="default"
              className="cursor-pointer hover:opacity-80 transition-opacity text-xs"
              onClick={() => toggleFilter('mood', mood)}
            >
              {mood}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
          {filters.search && (
            <Badge
              variant="default"
              className="cursor-pointer hover:opacity-80 transition-opacity text-xs"
              onClick={() => {
                setSearchTerm('');
                onFiltersChange({ search: undefined });
              }}
            >
              Search: {filters.search}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onResetFilters}
            className="text-xs text-white/60 hover:text-white"
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Filters Row - Era, Saga, Arc, Lane, Mood */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Era Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/60">Era:</span>
          <div className="flex flex-wrap gap-2">
            {eras.slice(0, 5).map((era) => {
              const isActive = filters.era?.includes(era.id);
              return (
                <Badge
                  key={era.id}
                  variant={isActive ? 'default' : 'outline'}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => toggleFilter('era', era.id)}
                >
                  {era.name}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Saga Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/60">Saga:</span>
          <div className="flex flex-wrap gap-2">
            {sagas.slice(0, 5).map((saga) => {
              const isActive = filters.saga?.includes(saga.id);
              return (
                <Badge
                  key={saga.id}
                  variant={isActive ? 'default' : 'outline'}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => toggleFilter('saga', saga.id)}
                >
                  {saga.name}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Arc Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/60">Arc:</span>
          <div className="flex flex-wrap gap-2">
            {arcs.slice(0, 5).map((arc) => {
              const isActive = filters.arc?.includes(arc.id);
              return (
                <Badge
                  key={arc.id}
                  variant={isActive ? 'default' : 'outline'}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => toggleFilter('arc', arc.id)}
                >
                  {arc.name}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Lane Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/60">Lane:</span>
          <div className="flex flex-wrap gap-2">
            {LANES.map((lane) => {
              const isActive = filters.lane?.includes(lane);
              return (
                <Badge
                  key={lane}
                  variant={isActive ? 'default' : 'outline'}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => toggleFilter('lane', lane)}
                >
                  {lane}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Mood Filter */}
        {availableMoods.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/60">Mood:</span>
            <div className="flex flex-wrap gap-2">
              {availableMoods.slice(0, 6).map((mood) => {
                const isActive = filters.mood?.includes(mood);
                return (
                  <Badge
                    key={mood}
                    variant={isActive ? 'default' : 'outline'}
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => toggleFilter('mood', mood)}
                  >
                    {mood}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* Filter Presets Row - Life | Robotics | MMA | Work | Creative */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-white/60">Presets:</span>
        {FILTER_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            variant={activePreset === preset.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyPreset(preset)}
            className="text-xs"
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {/* View Toggles */}
      {(onHeatmapToggle || onHighlightsToggle || onToggleConnections) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-white/60">Views:</span>
          {onHeatmapToggle && (
            <Button
              variant={showHeatmap ? 'default' : 'outline'}
              size="sm"
              onClick={() => onHeatmapToggle(!showHeatmap)}
              className="text-xs"
            >
              {showHeatmap ? '✓' : ''} Emotion Heatmap
            </Button>
          )}
          {onHighlightsToggle && (
            <Button
              variant={showHighlightsOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => onHighlightsToggle(!showHighlightsOnly)}
              className="text-xs"
            >
              {showHighlightsOnly ? '✓' : ''} Highlights Only
            </Button>
          )}
          {onToggleConnections && (
            <Button
              variant={showConnections ? 'default' : 'outline'}
              size="sm"
              onClick={() => onToggleConnections(!showConnections)}
              className="text-xs"
            >
              {showConnections ? '✓' : ''} Connections
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

