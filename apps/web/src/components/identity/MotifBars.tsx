export const MotifBars = ({ motifs }: { motifs: { name: string; energy: number }[] }) => (
  <div className="space-y-2">
    {motifs.map((motif) => (
      <div key={motif.name} className="space-y-1">
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>{motif.name}</span>
          <span className="text-cyan-200">{motif.energy}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-cyan"
            style={{ width: `${motif.energy}%` }}
          />
        </div>
      </div>
    ))}
  </div>
);
