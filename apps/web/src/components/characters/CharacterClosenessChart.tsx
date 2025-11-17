export const CharacterClosenessChart = ({ closeness }: { closeness: { timestamp: string; score: number }[] }) => (
  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
    <div className="text-xs uppercase text-white/60">Closeness</div>
    <div className="mt-2 grid grid-cols-4 items-end gap-2">
      {closeness.map((point) => (
        <div key={point.timestamp} className="space-y-1 text-center text-xs">
          <div className="mx-auto w-full rounded bg-gradient-to-t from-primary/40 to-cyan" style={{ height: `${point.score}px` }} />
          <span className="text-white/50">{new Date(point.timestamp).getMonth() + 1}/{new Date(point.timestamp).getFullYear()}</span>
        </div>
      ))}
    </div>
  </div>
);
