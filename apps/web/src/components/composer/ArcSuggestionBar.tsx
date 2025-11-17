const arcs = ['Genesis', 'Rift', 'Reconciliation'];

export const ArcSuggestionBar = () => (
  <div className="flex flex-wrap gap-2 text-xs text-white/70">
    <span className="text-white/50">Arc suggestions:</span>
    {arcs.map((arc) => (
      <span key={arc} className="rounded border border-cyan/40 px-3 py-1">
        {arc}
      </span>
    ))}
  </div>
);
