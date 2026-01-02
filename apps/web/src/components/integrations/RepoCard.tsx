import { GitBranch } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export type RepoCardProps = {
  name: string;
  description?: string;
  lastSync?: string | null;
  onSync?: () => void;
};

export const RepoCard = ({ name, description, lastSync, onSync }: RepoCardProps) => {
  return (
    <Card className="border border-blue-800/40 bg-slate-950/40 text-white">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-blue-400" />
          <CardTitle className="text-base text-white">{name}</CardTitle>
        </div>
        {onSync && (
          <button onClick={onSync} className="text-xs text-blue-300 hover:text-blue-100" type="button">
            Sync
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-white/70">
        <p>{description ?? 'Repository connected to the External Hub.'}</p>
        <p className="text-xs text-white/50">Last sync: {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}</p>
      </CardContent>
    </Card>
  );
};
