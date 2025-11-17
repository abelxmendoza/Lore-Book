export const MergeSuggestionDialog = ({
  suggestions
}: {
  suggestions: { id: string; title: string; rationale: string }[];
}) => (
  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-white/80">
    <div className="text-xs uppercase text-white/50">Merge Suggestions</div>
    {suggestions.length ? (
      <ul className="mt-2 space-y-2">
        {suggestions.map((suggestion) => (
          <li key={suggestion.id} className="rounded border border-primary/30 bg-black/40 p-2">
            <div className="font-semibold text-primary">{suggestion.title}</div>
            <p className="text-xs text-white/60">{suggestion.rationale}</p>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-xs text-white/60">No merge actions proposed.</p>
    )}
  </div>
);
