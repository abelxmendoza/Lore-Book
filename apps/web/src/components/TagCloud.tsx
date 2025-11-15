export const TagCloud = ({ tags }: { tags: { name: string; count: number }[] }) => (
  <div className="flex flex-wrap gap-2">
    {tags.map((tag) => (
      <span
        key={tag.name}
        className="rounded-full border border-primary/40 px-3 py-1 text-xs text-white/70"
        style={{ boxShadow: '0 0 10px rgba(221,75,255,0.15)' }}
      >
        #{tag.name} · {tag.count}
      </span>
    ))}
    {tags.length === 0 && <p className="text-xs text-white/40">No tags yet.</p>}
  </div>
);
