export const CharacterInfluenceMeter = ({ influence }: { influence: { category: string; score: number }[] }) => (
  <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-4">
    <div className="text-xs uppercase text-white/60">Influence</div>
    <div className="mt-2 space-y-2">
      {influence.map((item) => (
        <div key={item.category} className="space-y-1 text-sm text-white/80">
          <div className="flex items-center justify-between">
            <span>{item.category}</span>
            <span className="text-cyan">{item.score}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan to-primary" style={{ width: `${item.score}%` }} />
          </div>
        </div>
      ))}
    </div>
  </div>
);
