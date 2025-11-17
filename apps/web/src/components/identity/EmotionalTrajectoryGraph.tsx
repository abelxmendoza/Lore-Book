export const EmotionalTrajectoryGraph = ({
  points
}: {
  points: { label: string; value: number }[];
}) => (
  <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-3">
    <div className="grid grid-cols-4 items-end gap-2 text-center text-xs">
      {points.map((point) => (
        <div key={point.label} className="space-y-1">
          <div
            className="mx-auto w-full rounded bg-gradient-to-t from-cyan/30 to-primary"
            style={{ height: `${Math.max(point.value, 5)}px` }}
          />
          <p className="text-white/60">{point.label}</p>
        </div>
      ))}
    </div>
  </div>
);
