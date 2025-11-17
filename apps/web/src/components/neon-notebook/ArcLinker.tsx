import type { FC } from 'react';

import type { ArcSuggestion } from '../../utils/arcDetection';

export const ArcLinker: FC<{ arcs: ArcSuggestion[] }> = ({ arcs }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>Arc Detection</span>
        <span className="text-white/40">hologram cards</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {arcs.map((arc) => (
          <div key={arc.id} className="hologram-card rounded-xl p-3 shadow-neon">
            <div className="flex items-center justify-between text-xs text-white/70">
              <span className="font-semibold text-white">{arc.title}</span>
              <span className="text-[10px] text-white/50">{Math.round(arc.confidence * 100)}%</span>
            </div>
            <p className="mt-1 text-sm text-white/60">{arc.rationale}</p>
          </div>
        ))}
        {arcs.length === 0 && <p className="text-sm text-white/40">No arc alignment yet.</p>}
      </div>
    </div>
  );
};
