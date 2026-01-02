import { Github, Image, Link2, Radio, RefreshCw } from 'lucide-react';

import { useExternalHub } from '../../hooks/useExternalHub';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { InstagramCard } from './InstagramCard';
import { RepoCard } from './RepoCard';
import { SyncStatus } from './SyncStatus';

export const IntegrationPanel = () => {
  const { sources, latest, loading, error, ingest } = useExternalHub();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">External Signals Hub</h2>
          <p className="text-sm text-white/60">Normalize and summarize every external signal before it reaches the timeline.</p>
        </div>
        <button
          type="button"
          onClick={() => ingest('github')}
          className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/20 px-3 py-2 text-sm text-white hover:bg-primary/30"
        >
          <RefreshCw className="h-4 w-4" /> Manual Sync
        </button>
      </div>

      {error && <div className="rounded-md border border-red-800/50 bg-red-950/40 p-3 text-sm text-red-100">{error}</div>}

      <SyncStatus sources={sources} latest={latest} onSync={(source) => ingest(source)} />

      <div className="grid gap-4 md:grid-cols-2">
        <RepoCard name="GitHub" description="Commits and milestones summarize into timeline events." onSync={() => ingest('github')} lastSync={sources.find((s) => s.source === 'github')?.lastSync} />
        <InstagramCard handle="@you" onSync={() => ingest('instagram')} lastSync={sources.find((s) => s.source === 'instagram')?.lastSync} />
      </div>

      <Card className="border border-indigo-800/40 bg-indigo-950/40 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Link2 className="h-4 w-4" /> Unified Sources
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <SourcePill icon={<Github className="h-4 w-4" />} label="GitHub" onSync={() => ingest('github')} loading={loading} />
          <SourcePill icon={<Radio className="h-4 w-4" />} label="X" onSync={() => ingest('x')} loading={loading} />
          <SourcePill icon={<Image className="h-4 w-4" />} label="Photos" onSync={() => ingest('photos')} loading={loading} />
        </CardContent>
      </Card>
    </div>
  );
};

const SourcePill = ({
  icon,
  label,
  onSync,
  loading,
}: {
  icon: JSX.Element;
  label: string;
  onSync: () => void;
  loading?: boolean;
}) => (
  <button
    type="button"
    onClick={onSync}
    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-white hover:border-white/30"
    disabled={loading}
  >
    <span className="flex items-center gap-2">
      {icon}
      {label}
    </span>
    <RefreshCw className="h-4 w-4 text-white/60" />
  </button>
);
