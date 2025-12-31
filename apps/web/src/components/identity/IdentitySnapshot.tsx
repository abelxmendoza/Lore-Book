import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import type { IdentitySnapshot as IdentitySnapshotType } from '../../api/identity';

interface IdentitySnapshotProps {
  snapshot: IdentitySnapshotType[];
  compareData?: {
    pastSnapshot: IdentitySnapshotType[];
    showDifferences?: boolean;
  };
}

const TREND_ICONS = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
};

const INITIAL_VISIBLE = 8;
const ITEMS_PER_ROW = 4;

export const IdentitySnapshot = ({ snapshot, compareData }: IdentitySnapshotProps) => {
  const [showAll, setShowAll] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (snapshot.length === 0) {
    return (
      <div className="text-sm text-white/50 italic">
        No identity signals detected yet. Keep journaling to see patterns emerge.
      </div>
    );
  }

  // Sort by confidence (highest first)
  const sortedSnapshot = [...snapshot].sort((a, b) => b.confidence - a.confidence);
  const visibleItems = showAll ? sortedSnapshot : sortedSnapshot.slice(0, INITIAL_VISIBLE);
  const hasMore = snapshot.length > INITIAL_VISIBLE;

  // Find differences for compare mode
  const getDifference = (label: string) => {
    if (!compareData?.showDifferences) return null;
    const current = snapshot.find(s => s.label === label);
    const past = compareData.pastSnapshot.find(s => s.label === label);
    if (!current || !past) return null;
    const diff = current.confidence - past.confidence;
    if (Math.abs(diff) < 0.1) return null;
    return diff > 0 ? 'up' : 'down';
  };

  // Group by confidence levels for better organization
  const getConfidenceLevel = (confidence: number) => {
    if (confidence >= 0.8) return 'strong';
    if (confidence >= 0.6) return 'moderate';
    return 'emerging';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-white mb-1">Who You Are Right Now</h3>
          <p className="text-xs text-white/50">
            {snapshot.length} unique patterns detected in your recent journal entries
          </p>
        </div>
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-white/60 hover:text-white"
          >
            {showAll ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Show all {snapshot.length}
              </>
            )}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {visibleItems.map((item, index) => {
          const TrendIcon = TREND_ICONS[item.trend];
          const diff = getDifference(item.label);
          const showDiff = compareData?.showDifferences && diff;
          const confidenceLevel = getConfidenceLevel(item.confidence);
          const isHovered = hoveredIndex === index;
          
          return (
            <div
              key={index}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className={`bg-gradient-to-br from-black/50 to-black/30 border rounded-xl p-4 space-y-3 hover:border-primary/50 hover:from-primary/10 hover:to-primary/5 transition-all group cursor-pointer relative ${
                showDiff ? 'border-primary/50 bg-primary/10' : 'border-white/10'
              } ${isHovered ? 'scale-105 shadow-lg shadow-primary/20' : ''}`}
            >
              {/* Confidence level indicator */}
              <div className="absolute top-2 right-2">
                {confidenceLevel === 'strong' && (
                  <Sparkles className="h-3 w-3 text-primary" />
                )}
              </div>

              <div className="flex items-center justify-between pr-4">
                <span className="text-sm font-semibold text-white leading-tight">{item.label}</span>
                <TrendIcon 
                  className={`h-4 w-4 flex-shrink-0 ${
                    item.trend === 'up' ? 'text-green-400' :
                    item.trend === 'down' ? 'text-red-400' :
                    'text-white/40'
                  }`}
                />
              </div>
              
              {/* Confidence bar with percentage */}
              <div className="space-y-1">
                <div className="h-2 w-full rounded-full bg-black/60 overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r transition-all ${
                      confidenceLevel === 'strong' 
                        ? 'from-primary via-primary/90 to-primary/70' 
                        : confidenceLevel === 'moderate'
                        ? 'from-primary/80 via-primary/60 to-primary/40'
                        : 'from-primary/60 via-primary/40 to-primary/20'
                    }`}
                    style={{ width: `${item.confidence * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">
                    {confidenceLevel === 'strong' ? 'Strong' : confidenceLevel === 'moderate' ? 'Moderate' : 'Emerging'}
                  </span>
                  <span className="text-white/60 font-medium">
                    {(item.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              
              {showDiff && (
                <div className={`text-xs font-medium pt-1 border-t border-white/10 ${
                  diff === 'up' ? 'text-green-400' : 'text-blue-400'
                }`}>
                  {diff === 'up' ? '↑ Stronger than before' : '↓ Weaker than before'}
                </div>
              )}

              {/* Hover tooltip with more context */}
              {isHovered && (
                <div className="absolute bottom-full left-0 right-0 mb-2 p-2 bg-black/95 border border-primary/30 rounded-lg text-xs z-10 shadow-xl">
                  <div className="text-white/90 font-medium mb-1">{item.label}</div>
                  <div className="text-white/60">
                    Trend: {item.trend === 'up' ? 'Increasing' : item.trend === 'down' ? 'Decreasing' : 'Stable'}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasMore && !showAll && (
        <div className="text-center pt-2">
          <p className="text-xs text-white/40">
            +{snapshot.length - INITIAL_VISIBLE} more patterns detected
          </p>
        </div>
      )}
    </div>
  );
};
