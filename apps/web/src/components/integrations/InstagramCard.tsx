import { Image as ImageIcon } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export type InstagramCardProps = {
  handle: string;
  lastSync?: string | null;
  onSync?: () => void;
};

export const InstagramCard = ({ handle, lastSync, onSync }: InstagramCardProps) => (
  <Card className="border border-pink-800/40 bg-black/40 text-white">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-pink-400" />
        <CardTitle className="text-base text-white">Instagram • {handle}</CardTitle>
      </div>
      {onSync && (
        <button onClick={onSync} className="text-xs text-pink-300 hover:text-pink-100" type="button">
          Sync
        </button>
      )}
    </CardHeader>
    <CardContent className="space-y-2 text-sm text-white/70">
      <p>Stories and posts flow into the External Hub for filtering and summarization.</p>
      <p className="text-xs text-white/50">Last sync: {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}</p>
    </CardContent>
  </Card>
);
