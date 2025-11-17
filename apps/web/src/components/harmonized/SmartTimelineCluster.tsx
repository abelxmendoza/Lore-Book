import { HarmonizationCluster } from '../../harmonization/harmonization.reducer';
import { SmartEntryCard } from './SmartEntryCard';

export function SmartTimelineCluster({ cluster }: { cluster: HarmonizationCluster }) {
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-4">
      <header className="flex items-center justify-between">
        <h4 className="text-base font-semibold capitalize">{cluster.label}</h4>
        <span className="text-xs text-slate-500">{cluster.entries.length} entries</span>
      </header>
      <div className="space-y-2">
        {cluster.entries.map((entry, idx) => (
          <SmartEntryCard key={`${cluster.label}-${idx}`} entry={entry} />
        ))}
      </div>
    </section>
  );
}
