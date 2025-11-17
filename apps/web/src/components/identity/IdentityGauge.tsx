export const IdentityGauge = ({ stability }: { stability: number }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between text-xs text-white/60">
      <span>Identity Stability</span>
      <span className="text-primary font-semibold">{stability}%</span>
    </div>
    <div className="h-3 w-full overflow-hidden rounded-full bg-black/50">
      <div
        className="h-full bg-gradient-to-r from-secondary to-primary shadow-neon"
        style={{ width: `${stability}%` }}
      />
    </div>
  </div>
);
