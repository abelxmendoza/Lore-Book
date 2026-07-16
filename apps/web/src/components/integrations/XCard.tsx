import { RefreshCw, ExternalLink, Twitter, CheckCircle2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export type XCardProps = {
  username?: string;
  connected?: boolean;
  lastSync?: string | null;
  onSync?: () => void;
  onOpenDetails?: () => void;
};

export const XCard = ({ username, connected, lastSync, onSync, onOpenDetails }: XCardProps) => (
  <Card className="relative overflow-hidden border border-sky-500/30 bg-gradient-to-br from-sky-950/50 via-black/50 to-cyan-950/30 text-white">
    <div
      aria-hidden
      className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-sky-500/10 blur-2xl"
    />
    <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/15 ring-1 ring-sky-400/30">
          <Twitter className="h-4 w-4 text-sky-300" />
        </span>
        <CardTitle className="text-base text-white">
          X {username ? <span className="text-sky-300 font-normal">@{username}</span> : ''}
        </CardTitle>
      </div>
      <div className="flex items-center gap-2">
        {onSync && (
          <button
            onClick={onSync}
            className="text-xs text-sky-200 hover:text-white flex items-center gap-1 rounded-lg border border-sky-400/25 bg-sky-500/10 px-2 py-1 disabled:opacity-50"
            type="button"
            disabled={!connected}
          >
            <RefreshCw className="h-3 w-3" /> Sync
          </button>
        )}
        {onOpenDetails && (
          <button
            onClick={onOpenDetails}
            className="text-xs text-sky-300/80 hover:text-sky-100 flex items-center gap-1"
            type="button"
          >
            Details <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>
    </CardHeader>
    <CardContent className="relative space-y-2 text-sm text-white/70">
      <p>
        Posts, quotes, and replies become journal entries with full provenance — people and places
        link back to the original post.
      </p>
      <div className="flex items-center justify-between text-xs">
        <span className={connected ? 'inline-flex items-center gap-1 text-emerald-400' : 'text-amber-400'}>
          {connected ? (
            <>
              <CheckCircle2 className="h-3 w-3" /> Connected
            </>
          ) : (
            'Not connected'
          )}
        </span>
        <span className="text-white/50">
          Last sync: {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}
        </span>
      </div>
    </CardContent>
  </Card>
);
