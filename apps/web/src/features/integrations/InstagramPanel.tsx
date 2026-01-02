import { useState } from 'react';

export function InstagramPanel() {
  const [status, setStatus] = useState<string>('');

  const sync = async () => {
    setStatus('Syncing...');
    try {
      const res = await fetch('/api/integrations/instagram/sync');
      const data = await res.json();
      setStatus(`Synced ${data.count ?? 0} posts`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Sync failed');
    }
  };

  return (
    <div className="neon-card space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Instagram</h2>
        <button className="px-3 py-1 rounded-md bg-pink-500/80 text-white" onClick={sync}>
          Sync Now
        </button>
      </div>
      <p className="text-sm text-neutral-300">Turn posts and stories into distilled memories for your lore timeline.</p>
      {status && <p className="text-xs text-green-200">{status}</p>}
    </div>
  );
}
