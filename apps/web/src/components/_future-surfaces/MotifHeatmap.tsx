import React from 'react';

import type { Insight } from './InsightCard';

export const MotifHeatmap = ({ motifs }: { motifs?: Insight[] }) => {
  const cells = (motifs ?? []).map((motif, index) => ({
    label: motif.motif ?? motif.pattern ?? `Motif ${index + 1}`,
    intensity: Math.min(1, motif.confidence ?? 0),
    evidence: motif.evidence?.join(', ')
  }));

  if (!cells.length) {
    return <p className="text-sm text-white/50">No motifs detected.</p>;
  }

  return (
    <div className="rounded-xl border border-border/60 bg-black/40 p-4">
      <p className="mb-3 text-sm font-semibold text-white">Motif heatmap</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="rounded-lg p-3 text-sm text-white"
            style={{ backgroundColor: `rgba(16, 185, 129, ${0.2 + 0.6 * cell.intensity})` }}
            title={cell.evidence}
          >
            <p className="font-semibold">{cell.label}</p>
            <p className="text-xs text-white/70">Signal: {Math.round(cell.intensity * 100)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
};
