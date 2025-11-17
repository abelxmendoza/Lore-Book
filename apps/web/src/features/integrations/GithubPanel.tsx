import { useState } from 'react';

export function GithubPanel() {
  const [status, setStatus] = useState<string>('');

  const sync = async () => {
    setStatus('Syncing...');
    try {
      const res = await fetch('/api/integrations/github/sync');
      const data = await res.json();
      setStatus(`Synced ${data.count ?? 0} events`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Sync failed');
    }
  };

  return (
    <div className="neon-card space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">GitHub</h2>
        <button className="px-3 py-1 rounded-md bg-purple-500/80 text-white" onClick={sync}>
          Sync Now
        </button>
      </div>
      <p className="text-sm text-neutral-300">Capture milestones from your repositories and distill them into the timeline.</p>
      {status && <p className="text-xs text-green-200">{status}</p>}
    </div>
  );
}
