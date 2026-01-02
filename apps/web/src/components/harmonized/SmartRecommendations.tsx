export function SmartRecommendations({ surfaces }: { surfaces: string[] }) {
  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-emerald-900">
      <p className="text-sm font-semibold">Recommended Surfaces</p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {surfaces.map((surface) => (
          <span key={surface} className="rounded-full bg-white px-3 py-1 capitalize">
            {surface}
          </span>
        ))}
      </div>
    </div>
  );
}
