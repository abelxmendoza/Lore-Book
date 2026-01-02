import type { ContinuityConflict } from '../../api/continuity';

export const ConflictList = ({ conflicts }: { conflicts: ContinuityConflict[] }) => (
  <div className="space-y-2 rounded-lg border border-secondary/30 bg-secondary/5 p-4">
    <div className="text-xs uppercase text-white/60">Conflicts</div>
    {conflicts.map((conflict) => (
      <div key={conflict.id} className="rounded border border-secondary/30 bg-black/40 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/80">{conflict.title}</span>
          <span className="text-secondary">{conflict.severity}</span>
        </div>
        {conflict.details && <p className="text-xs text-white/60">{conflict.details}</p>}
      </div>
    ))}
  </div>
);
