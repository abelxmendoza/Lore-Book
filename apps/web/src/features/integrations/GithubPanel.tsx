import { useState } from 'react';
import { Github, Loader2, RefreshCw } from 'lucide-react';

export function GithubPanel() {
  const [status, setStatus] = useState<string>('');
  const [working, setWorking] = useState(false);

  const sync = async () => {
    setWorking(true);
    setStatus('');
    try {
      const res = await fetch('/api/integrations/github/sync');
      const data = await res.json();
      setStatus(`Synced ${data.count ?? 0} events from GitHub.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
          <Github className="h-5 w-5 text-white/90" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">GitHub</h3>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-white/55">
            Capture commits, releases, and milestones from your repositories and distill them into your timeline and lore.
          </p>

          {status && (
            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-sm text-emerald-300">
              {status}
            </div>
          )}
        </div>

        <div className="shrink-0">
          <button
            type="button"
            onClick={sync}
            disabled={working}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {working ? 'Syncing…' : 'Sync'}
          </button>
        </div>
      </div>
    </div>
  );
}
