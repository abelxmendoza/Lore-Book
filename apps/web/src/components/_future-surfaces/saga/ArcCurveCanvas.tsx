export const ArcCurveCanvas = ({ arcs }: { arcs: { id: string; label: string; intensity: number }[] }) => (
  <div className="rounded-lg border border-cyan/30 bg-neon-grid p-4 text-sm text-white/80">
    <div className="text-xs uppercase text-white/60">Arc Curves</div>
    <div className="mt-2 flex gap-2">
      {arcs.map((arc) => (
        <div key={arc.id} className="flex-1 space-y-1 rounded bg-black/40 p-2">
          <div className="text-primary">{arc.label}</div>
          <div className="h-2 w-full rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-cyan" style={{ width: `${arc.intensity}%` }} />
          </div>
        </div>
      ))}
    </div>
  </div>
);
