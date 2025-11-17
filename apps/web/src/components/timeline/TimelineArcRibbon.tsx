export const TimelineArcRibbon = ({
  arcs
}: {
  arcs: { id: string; name: string; color: string }[];
}) => (
  <div className="flex flex-wrap gap-2 text-xs">
    {arcs.map((arc) => (
      <span
        key={arc.id}
        className="rounded-full px-3 py-1 font-medium uppercase text-foreground"
        style={{ background: arc.color }}
      >
        {arc.name}
      </span>
    ))}
  </div>
);
