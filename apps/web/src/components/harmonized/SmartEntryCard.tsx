import { HarmonizationHighlight } from '../../harmonization/harmonization.reducer';
import { SmartCharacterChip } from './SmartCharacterChip';

export function SmartEntryCard({ entry }: { entry: HarmonizationHighlight & { characters?: string[]; mood?: string; arcs?: string[] } }) {
  return (
    <div className="rounded-md border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase text-slate-500">{entry.reason ?? 'recent'}</p>
          <h3 className="text-lg font-semibold">{entry.title}</h3>
          <p className="text-slate-600">{entry.summary}</p>
        </div>
        <button className="rounded bg-indigo-100 px-2 py-1 text-xs text-indigo-700">Expand</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(entry.characters ?? []).map((name) => (
          <SmartCharacterChip key={name} name={name} />
        ))}
      </div>
      {entry.arcs?.length ? (
        <p className="mt-2 text-sm text-slate-500">Arcs: {entry.arcs.join(', ')}</p>
      ) : null}
      {entry.mood ? <p className="text-sm text-slate-500">Mood: {entry.mood}</p> : null}
    </div>
  );
}
