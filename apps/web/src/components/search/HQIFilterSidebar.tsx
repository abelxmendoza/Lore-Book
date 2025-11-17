export const HQIFilterSidebar = ({
  filters,
  onChange
}: {
  filters: { scope?: string[]; tags?: string[] };
  onChange: (next: { scope?: string[]; tags?: string[] }) => void;
}) => (
  <div className="w-60 rounded-xl border border-border/40 bg-white/5 p-4 text-sm text-white/70">
    <h3 className="mb-2 text-xs uppercase text-white/50">Filters</h3>
    <div className="space-y-2">
      <label className="block">
        <span className="text-xs text-white/60">Scopes</span>
        <input
          className="mt-1 w-full rounded bg-black/40 p-2 text-white"
          placeholder="memory, task"
          value={filters.scope?.join(', ') ?? ''}
          onChange={(e) => onChange({ ...filters, scope: e.target.value.split(/,\s*/) })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-white/60">Tags</span>
        <input
          className="mt-1 w-full rounded bg-black/40 p-2 text-white"
          placeholder="identity, arc"
          value={filters.tags?.join(', ') ?? ''}
          onChange={(e) => onChange({ ...filters, tags: e.target.value.split(/,\s*/) })}
        />
      </label>
    </div>
  </div>
);
