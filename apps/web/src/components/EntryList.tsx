import { Fragment, useRef } from 'react';
import { Calendar, Tag } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { JournalEntry } from '../hooks/useLoreKeeper';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export type EntryListProps = {
  entries: JournalEntry[];
};

export const EntryList = ({ entries }: EntryListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120, // Estimated height per entry
    overscan: 5
  });

  if (entries.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Recent Memories</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-white/40">No entries yet. Your future memories go here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Recent Memories</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <div ref={parentRef} className="h-full overflow-auto" style={{ contain: 'strict' }}>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative'
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const entry = entries[virtualItem.index];
              return (
                <div
                  key={entry.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`
                  }}
                >
                  <div className="space-y-2 px-2">
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
                    {virtualItem.index < entries.length - 1 && (
                      <div className="h-px w-full bg-white/10 mt-4" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
