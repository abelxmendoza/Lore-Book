import type { CanonFact, ContinuityConflict } from '../../api/continuity';

export const ContinuityGraph = ({ facts, conflicts }: { facts: CanonFact[]; conflicts: ContinuityConflict[] }) => (
  <div className="rounded-lg border border-border/40 bg-black/40 p-4">
    <div className="text-xs uppercase text-white/50">Continuity Graph</div>
    <div className="mt-2 h-32 bg-neon-grid" />
    <p className="mt-2 text-xs text-white/60">
      Facts: {facts.length} • Conflicts: {conflicts.length}
    </p>
  </div>
);
