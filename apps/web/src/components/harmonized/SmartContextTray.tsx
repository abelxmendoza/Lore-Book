export function SmartContextTray({ hints, flags, mode }: { hints: any[]; flags: any[]; mode: 'normal' | 'pro' }) {
  return (
    <aside className="flex flex-col gap-2 rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-indigo-900">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Context Tray ({mode})</span>
        <span className="text-xs text-indigo-700">{hints.length} motifs</span>
      </div>
      {hints.length ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {hints.map((hint, idx) => (
            <span key={idx} className="rounded-full bg-white px-3 py-1">
              {String(hint)}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-indigo-700">No active motifs yet</p>
      )}
      {flags.length ? (
        <div className="text-xs text-amber-800">
          <p className="font-semibold">Continuity warnings</p>
          <ul className="list-disc pl-4">
            {flags.map((flag, idx) => (
              <li key={idx}>{typeof flag === 'string' ? flag : flag?.detail ?? 'Check continuity'}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
