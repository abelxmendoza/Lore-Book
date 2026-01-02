import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { MotifEvolution as MotifEvolutionType } from '../../api/identity';

interface MotifEvolutionProps {
  motifs: MotifEvolutionType[];
  selectedMotif?: string | null;
  onMotifClick?: (motifName: string) => void;
}

export const MotifEvolution = ({ motifs, selectedMotif: externalSelected, onMotifClick }: MotifEvolutionProps) => {
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selectedMotif = externalSelected !== undefined ? externalSelected : internalSelected;

  if (motifs.length === 0) {
    return (
      <div className="text-sm text-white/50 italic">
        Motif patterns will emerge as you continue journaling.
      </div>
    );
  }

  const handleMotifClick = (motifName: string) => {
    const newSelection = selectedMotif === motifName ? null : motifName;
    if (externalSelected === undefined) {
      setInternalSelected(newSelection);
    }
    onMotifClick?.(newSelection || '');
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Recurring Patterns</h3>
        <p className="text-xs text-white/50">Themes that appear across your entries and how they've evolved</p>
      </div>
      <div className="space-y-3">
        {motifs.map((motif) => {
          const maxValue = Math.max(...motif.sparkline, 0.1);
          const isSelected = selectedMotif === motif.name;

          return (
            <div
              key={motif.name}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-primary/10 border-primary/40 shadow-lg shadow-primary/10'
                  : 'bg-gradient-to-br from-black/50 to-black/30 border-white/10 hover:border-primary/30 hover:from-primary/5'
              }`}
              onClick={() => handleMotifClick(motif.name)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-white">{motif.name}</span>
                </div>
                {motif.peakMarkers.length > 0 && (
                  <span className="text-xs text-white/50">
                    {motif.peakMarkers.length} peak{motif.peakMarkers.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Sparkline */}
              <div className="flex items-end gap-0.5 h-12 mb-2">
                {motif.sparkline.map((value, index) => {
                  const height = (value / maxValue) * 100;
                  return (
                    <div
                      key={index}
                      className="flex-1 bg-primary/40 rounded-t hover:bg-primary/60 transition-colors"
                      style={{ height: `${Math.max(2, height)}%` }}
                      title={`Week ${index + 1}: ${(value * 100).toFixed(0)}%`}
                    />
                  );
                })}
              </div>

              {/* Peak markers */}
              {isSelected && motif.peakMarkers.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/20 space-y-1">
                  <div className="text-xs text-white/60 mb-1">Peak moments:</div>
                  {motif.peakMarkers.map((peak, index) => (
                    <div key={index} className="text-xs text-white/70">
                      {peak.date}: {(peak.intensity * 100).toFixed(0)}% intensity
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
