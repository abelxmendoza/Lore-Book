const suggested = ['identity', 'drift', 'arc', 'memory', 'pulse'];

export const TagSuggestionBar = () => (
  <div className="flex flex-wrap gap-2 text-xs text-white/70">
    <span className="text-white/50">Suggested tags:</span>
    {suggested.map((tag) => (
      <span key={tag} className="rounded-full border border-primary/40 px-3 py-1">
        #{tag}
      </span>
    ))}
  </div>
);
