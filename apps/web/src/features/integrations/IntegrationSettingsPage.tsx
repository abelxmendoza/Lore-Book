import { GithubPanel } from './GithubPanel';
import { InstagramPanel } from './InstagramPanel';

export function IntegrationSettingsPage() {
  return (
    <div className="p-6 space-y-6 text-neon-purple">
      <div>
        <p className="text-sm uppercase tracking-widest text-neutral-400">Lore Keeper</p>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-neutral-300 mt-2 max-w-2xl">
          Connect external signals and let the orchestrator distill them into memories.
        </p>
      </div>

      <GithubPanel />
      <InstagramPanel />
    </div>
  );
}
