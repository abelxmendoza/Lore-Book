import { Radio, RefreshCw, ExternalLink } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export type XCardProps = {
  username?: string;
  connected?: boolean;
  lastSync?: string | null;
  onSync?: () => void;
  onOpenDetails?: () => void;
};

export const XCard = ({ username, connected, lastSync, onSync, onOpenDetails }: XCardProps) => (
  <Card className="border border-sky-800/40 bg-black/40 text-white">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-sky-400" />
        <CardTitle className="text-base text-white">X / Twitter {username ? `• @${username}` : ''}</CardTitle>
      </div>
      <div className="flex items-center gap-2">
        {onSync && (
          <button
            onClick={onSync}
            className="text-xs text-sky-300 hover:text-sky-100 flex items-center gap-1"
            type="button"
            disabled={!connected}
          >
            <RefreshCw className="h-3 w-3" /> Sync
          </button>
        )}
        {onOpenDetails && (
          <button
            onClick={onOpenDetails}
            className="text-xs text-sky-300 hover:text-sky-100 flex items-center gap-1"
            type="button"
          >
            Details <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>
    </CardHeader>
    <CardContent className="space-y-2 text-sm text-white/70">
      <p>
        Your posts and replies are imported as journal entries, run through the ER pipeline, and become part of your lore with full provenance.
      </p>
      <div className="flex items-center justify-between text-xs">
        <span className={connected ? 'text-emerald-400' : 'text-amber-400'}>
          {connected ? 'Connected' : 'Not connected'}
        </span>
        <span className="text-white/50">Last sync: {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}</span>
      </div>
      <p className="text-[10px] text-white/50">
        Entities and relationships from these posts are stamped with links back to the original X post.
      </p>
    </CardContent>
  </Card>
);
