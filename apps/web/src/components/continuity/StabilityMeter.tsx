export const StabilityMeter = ({ score }: { score: number }) => (
  <div className="flex items-center gap-2 text-sm text-white/70">
    <span>Stability</span>
    <div className="h-2 w-40 overflow-hidden rounded-full bg-black/50">
      <div className="h-full bg-gradient-to-r from-secondary to-primary" style={{ width: `${score}%` }} />
    </div>
    <span className="text-primary font-semibold">{score}%</span>
  </div>
);
