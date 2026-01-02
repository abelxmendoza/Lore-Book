import { CheckCircle2, Clock, RefreshCw } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import type { ExternalSourceStatus, ExternalTimelineEntry } from '../../hooks/useExternalHub';

export type SyncStatusProps = {
  sources: ExternalSourceStatus[];
  latest: ExternalTimelineEntry[];
  onSync?: (source: ExternalSourceStatus['source']) => void;
};

export const SyncStatus = ({ sources, latest, onSync }: SyncStatusProps) => {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border border-emerald-800/40 bg-emerald-950/30 text-white">
        <CardHeader className="flex items-center justify-between pb-2">
          <CardTitle className="text-lg">Connections</CardTitle>
          <Clock className="h-4 w-4 text-emerald-400" />
        </CardHeader>
        <CardContent className="space-y-3">
          {sources.map((source) => (
            <div key={source.source} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`h-4 w-4 ${source.connected ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span className="capitalize">{source.source}</span>
                <span className="text-xs text-white/50">{source.lastSync ? new Date(source.lastSync).toLocaleString() : 'Not synced'}</span>
              </div>
              {onSync && (
                <button
                  onClick={() => onSync(source.source)}
                  className="flex items-center gap-1 text-xs text-emerald-200 hover:text-white"
                  type="button"
                >
                  <RefreshCw className="h-3 w-3" /> Sync
                </button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border border-purple-800/40 bg-purple-950/30 text-white">
        <CardHeader className="flex items-center justify-between pb-2">
          <CardTitle className="text-lg">Latest Milestones</CardTitle>
          <Clock className="h-4 w-4 text-purple-400" />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {latest.length === 0 && <p className="text-white/60">No milestones yet.</p>}
          {latest.map((entry) => (
            <div key={`${entry.source}-${entry.timestamp}-${entry.type}`} className="rounded border border-purple-800/40 bg-purple-950/40 p-3">
              <div className="flex items-center justify-between text-xs text-white/60">
                <span className="capitalize">{entry.source}</span>
                <span>{new Date(entry.timestamp).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-white">{entry.summary ?? entry.text}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
