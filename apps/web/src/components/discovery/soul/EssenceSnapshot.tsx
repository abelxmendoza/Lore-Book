import type { EssenceProfile } from '../../../types/essence';

interface EssenceSnapshotProps {
  profile: EssenceProfile;
}

/**
 * EssenceSnapshot - At-a-Glance Core
 * Shows 3-5 dominant, stable signals derived across time
 */
export const EssenceSnapshot = ({ profile }: EssenceSnapshotProps) => {
  // Extract dominant signals from all categories
  const allInsights = [
    ...(profile.hopes || []).slice(0, 2),
    ...(profile.dreams || []).slice(0, 1),
    ...(profile.strengths || []).slice(0, 1),
    ...(profile.coreValues || []).slice(0, 1),
  ]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  if (allInsights.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white/80 mb-1">At a Glance</h3>
        <p className="text-xs text-white/50">Dominant signals derived from repeated entries over time</p>
      </div>
      
      <div className="flex flex-wrap gap-3">
        {allInsights.map((insight, idx) => {
          const isHighConfidence = insight.confidence >= 0.8;
          const isVeryHighConfidence = insight.confidence >= 0.9;
          
          return (
            <div
              key={idx}
              className={`flex-1 min-w-[200px] p-4 rounded-xl transition-all group ${
                isVeryHighConfidence
                  ? 'bg-gradient-to-br from-primary/20 to-primary/10 border-2 border-primary/40 shadow-lg shadow-primary/20'
                  : isHighConfidence
                  ? 'bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30'
                  : 'bg-gradient-to-br from-black/40 to-black/20 border border-white/5'
              } hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10`}
              title="Derived from repeated entries over time"
            >
              {isVeryHighConfidence && (
                <div className="flex items-center gap-1 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs text-primary/80 font-medium">Strong Signal</span>
                </div>
              )}
              <p className={`text-sm mb-2 leading-relaxed ${
                isVeryHighConfidence ? 'text-white font-medium' : 'text-white/90'
              }`}>{insight.text}</p>
              <div className="h-1.5 bg-black/60 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    isVeryHighConfidence
                      ? 'bg-gradient-to-r from-primary via-primary/90 to-primary/70'
                      : isHighConfidence
                      ? 'bg-gradient-to-r from-primary/80 to-primary/60'
                      : 'bg-gradient-to-r from-primary/60 to-primary/40'
                  }`}
                  style={{ width: `${insight.confidence * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
