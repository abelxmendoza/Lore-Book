import { Fragment } from 'react';
import { Calendar, Tag } from 'lucide-react';

import type { JournalEntry } from '../hooks/useLoreKeeper';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export type EntryListProps = {
  entries: JournalEntry[];
};

export const EntryList = ({ entries }: EntryListProps) => (
  <Card className="h-full">
    <CardHeader>
      <CardTitle>Recent Memories</CardTitle>
    </CardHeader>
    <CardContent className="space-y-6">
      {entries.length === 0 && <p className="text-white/40">No entries yet. Your future memories go here.</p>}
      {entries.map((entry) => (
        <Fragment key={entry.id}>
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-white/50">
              <Calendar className="h-4 w-4 text-primary" />
              {new Date(entry.date).toLocaleString()}
              {entry.mood && <Badge className="ml-auto border-cyan-400/50 text-cyan-300">{entry.mood}</Badge>}
            </div>
            <p className="text-sm text-white/80">{entry.summary ?? entry.content}</p>
            {entry.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs text-white/50">
                <Tag className="h-3 w-3 text-primary" />
                {entry.tags.map((tag) => (
                  <span key={tag} className="rounded bg-white/5 px-2 py-0.5">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="h-px w-full bg-white/10" />
        </Fragment>
      ))}
    </CardContent>
  </Card>
);
