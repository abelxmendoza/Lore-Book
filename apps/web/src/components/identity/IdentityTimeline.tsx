import { useState } from 'react';
import type { TimelineData } from '../../api/identity';

interface IdentityTimelineProps {
  timeline: TimelineData[];
  compareMode?: boolean;
  pastTimeline?: TimelineData[];
  selectedMotif?: string | null;
  onMotifSelect?: (motif: string | null) => void;
}

interface TimelinePeriodProps {
  period: TimelineData;
  themeColors: Record<string, string>;
  selectedTheme: string | null;
  onThemeHover: (theme: string | null) => void;
  getThemeOpacity: (themeName: string) => number;
}

export const IdentityTimeline = ({ 
  timeline, 
  compareMode = false,
  pastTimeline,
  selectedMotif,
  onMotifSelect
}: IdentityTimelineProps) => {
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [showMajorShiftsOnly, setShowMajorShiftsOnly] = useState(false);

  if (timeline.length === 0) {
    return (
      <div className="text-sm text-white/50 italic">
        Timeline data will appear as you journal over time.
      </div>
    );
  }

  // Get all unique themes for color mapping
  const allThemes = new Set<string>();
  timeline.forEach(period => {
    period.themes.forEach(theme => allThemes.add(theme.name));
  });
  const themeColors = Array.from(allThemes).reduce((acc, theme, index) => {
    const hues = [200, 250, 300, 350, 50, 100, 150]; // Purple/blue spectrum
    acc[theme] = `hsl(${hues[index % hues.length]}, 70%, 60%)`;
    return acc;
  }, {} as Record<string, string>);

  // Filter to major shifts if enabled
  const filteredTimeline = showMajorShiftsOnly
    ? timeline.filter(period => 
        period.themes.some(t => t.strength > 0.5)
      )
    : timeline;

  // Highlight themes that match selected motif
  const getThemeOpacity = (themeName: string) => {
    if (!selectedMotif) return 0.7;
    const motifLower = selectedMotif.toLowerCase();
    const themeLower = themeName.toLowerCase();
    return themeLower.includes(motifLower) || motifLower.includes(themeLower) ? 1 : 0.3;
  };

  // Timeline Period Component
  const TimelinePeriod = ({ period, themeColors, selectedTheme, onThemeHover, getThemeOpacity }: TimelinePeriodProps) => {
    const handleClick = () => {
      // TODO: Navigate to journal entries for this period
      console.log('Clicked period:', period.date, 'themes:', period.themes);
    };

    return (
      <div
        className="flex-shrink-0 w-24 relative group cursor-pointer"
        onMouseEnter={() => {
          if (period.themes.length > 0) {
            onThemeHover(period.themes[0].name);
          }
        }}
        onMouseLeave={() => onThemeHover(null)}
        onClick={handleClick}
      >
      {/* Stacked bands representing themes */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col-reverse gap-0.5">
        {period.themes.map((theme) => {
          const height = Math.max(10, theme.strength * 150);
          const isHighlighted = selectedTheme === theme.name;
          const opacity = getThemeOpacity(theme.name);
          return (
            <div
              key={theme.name}
              className="rounded-t transition-all cursor-pointer hover:opacity-100"
              style={{
                height: `${height}px`,
                backgroundColor: themeColors[theme.name] || '#8b5cf6',
                opacity: isHighlighted ? 1 : opacity,
                minHeight: '4px',
              }}
              title={`${theme.name}: ${(theme.strength * 100).toFixed(0)}%`}
            />
          );
        })}
      </div>

      {/* Date label */}
      <div className="absolute -bottom-6 left-0 right-0 text-xs text-white/40 text-center">
        {period.date.split('-W')[1] || period.date}
      </div>

      {/* Hover tooltip */}
      {selectedTheme && period.themes.some(t => t.name === selectedTheme) && (
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-black/90 border border-primary/30 rounded-lg p-2 text-xs z-10 min-w-[150px]">
          <div className="font-semibold text-white mb-1">{period.date}</div>
          {period.themes.map(theme => (
            <div key={theme.name} className="text-white/70">
              {theme.name}: {(theme.strength * 100).toFixed(0)}%
            </div>
          ))}
        </div>
      )}
    </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white/80">
              Identity Evolution Timeline
              {selectedMotif && (
                <span className="ml-2 text-xs text-primary/70">
                  (highlighting: {selectedMotif})
                  <button
                    onClick={() => onMotifSelect?.(null)}
                    className="ml-1 text-primary/50 hover:text-primary"
                    title="Clear selection"
                  >
                    ×
                  </button>
                </span>
              )}
            </h3>
            <p className="text-xs text-white/40 mt-0.5">
              Themes that appeared in your entries over time (thicker = stronger)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
            <input
              type="checkbox"
              checked={showMajorShiftsOnly}
              onChange={(e) => setShowMajorShiftsOnly(e.target.checked)}
              className="rounded"
            />
            Show only major shifts
          </label>
          <span className="text-xs text-white/40">Click periods to view entries</span>
        </div>
      </div>

      {compareMode && pastTimeline ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-white/50 mb-2">Now</div>
            <div className="relative">
              <div className="overflow-x-auto pb-4 -mx-2 px-2">
                <div className="flex gap-2 min-w-max" style={{ height: '200px' }}>
                  {filteredTimeline.map((period) => (
                    <TimelinePeriod
                      key={period.date}
                      period={period}
                      themeColors={themeColors}
                      selectedTheme={selectedTheme}
                      onThemeHover={setSelectedTheme}
                      getThemeOpacity={getThemeOpacity}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs text-white/50 mb-2">6 Months Ago</div>
            <div className="relative">
              <div className="overflow-x-auto pb-4 -mx-2 px-2">
                <div className="flex gap-2 min-w-max" style={{ height: '200px' }}>
                  {pastTimeline.map((period) => (
                    <TimelinePeriod
                      key={period.date}
                      period={period}
                      themeColors={themeColors}
                      selectedTheme={selectedTheme}
                      onThemeHover={setSelectedTheme}
                      getThemeOpacity={getThemeOpacity}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative">
          {/* Scrollable timeline container */}
          <div className="overflow-x-auto pb-4 -mx-2 px-2">
            <div className="flex gap-2 min-w-max" style={{ height: '200px' }}>
              {filteredTimeline.map((period) => (
                <TimelinePeriod
                  key={period.date}
                  period={period}
                  themeColors={themeColors}
                  selectedTheme={selectedTheme}
                  onThemeHover={setSelectedTheme}
                  getThemeOpacity={getThemeOpacity}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Legend - shown for both modes */}
      <div className="flex flex-wrap gap-2 mt-8 text-xs">
        {Array.from(allThemes).slice(0, 8).map(theme => (
          <div
            key={theme}
            className="flex items-center gap-1.5 cursor-pointer hover:opacity-80"
            onClick={() => setSelectedTheme(selectedTheme === theme ? null : theme)}
          >
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: themeColors[theme] || '#8b5cf6' }}
            />
            <span className="text-white/60">{theme}</span>
          </div>
        ))}
      </div>

      {compareMode && pastTimeline && (
        <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs text-white/70">
          <p className="font-semibold text-white/90 mb-1">Comparison Notes:</p>
          <p>Side-by-side view shows how your identity themes have evolved. Click motifs below to highlight them on the timeline.</p>
        </div>
      )}
    </div>
  );
};
