import { Activity, Clock } from 'lucide-react';

import type { TimelineResponse } from '../hooks/useLoreKeeper';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export const TimelinePanel = ({ timeline }: { timeline: TimelineResponse }) => (
  <Card>
    <CardHeader className="items-center justify-between">
      <CardTitle className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" /> Timeline
      </CardTitle>
      <p className="text-xs text-white/50">Chapters + loose notes</p>
    </CardHeader>
    <CardContent className="space-y-6">
      {timeline.chapters.map((chapter) => (
        <div key={chapter.id}>
          <div className="flex items-center gap-2 text-xs uppercase text-white/50">
            <Clock className="h-3 w-3" />
            {chapter.title}
          </div>
          {chapter.months.map((group) => (
            <ul key={group.month} className="mt-2 space-y-1 text-sm text-white/80">
              <li className="text-xs uppercase text-white/40">{group.month}</li>
              {group.entries.slice(0, 2).map((entry) => (
                <li key={entry.id} className="truncate border-l-2 border-primary/70 pl-3">
                  {entry.summary ?? entry.content}
                </li>
              ))}
            </ul>
          ))}
        </div>
      ))}
      {timeline.unassigned.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-xs uppercase text-white/50">
            <Clock className="h-3 w-3" /> Unassigned
          </div>
          {timeline.unassigned.map((group) => (
            <ul key={group.month} className="mt-2 space-y-1 text-sm text-white/80">
              <li className="text-xs uppercase text-white/40">{group.month}</li>
              {group.entries.slice(0, 2).map((entry) => (
                <li key={entry.id} className="truncate border-l-2 border-primary/70 pl-3">
                  {entry.summary ?? entry.content}
                </li>
              ))}
            </ul>
          ))}
        </div>
      )}
      {timeline.chapters.length === 0 && timeline.unassigned.length === 0 && (
        <p className="text-white/40">No timeline data yet.</p>
      )}
    </CardContent>
  </Card>
);
