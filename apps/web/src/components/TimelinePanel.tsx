import { Activity, Clock } from 'lucide-react';

import type { TimelineGroup } from '../hooks/useLoreKeeper';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export const TimelinePanel = ({ timeline }: { timeline: TimelineGroup[] }) => (
  <Card>
    <CardHeader className="items-center justify-between">
      <CardTitle className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" /> Timeline
      </CardTitle>
      <p className="text-xs text-white/50">Auto-generated chapters</p>
    </CardHeader>
    <CardContent className="space-y-6">
      {timeline.map((group) => (
        <div key={group.month}>
          <div className="flex items-center gap-2 text-xs uppercase text-white/50">
            <Clock className="h-3 w-3" />
            {group.month}
          </div>
          <ul className="mt-2 space-y-1 text-sm text-white/80">
            {group.entries.slice(0, 3).map((entry) => (
              <li key={entry.id} className="truncate border-l-2 border-primary/70 pl-3">
                {entry.summary ?? entry.content}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {timeline.length === 0 && <p className="text-white/40">No timeline data yet.</p>}
    </CardContent>
  </Card>
);
