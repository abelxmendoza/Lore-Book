import type { CharacterMemory } from '../../api/characters';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { TimelineDateHeader, TimelineInlineDate } from '../timeline/TimelineDateDisplay';

export const CharacterSharedTimeline = ({ memories }: { memories: CharacterMemory[] }) => {
  const sorted = [...memories].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  let lastDateKey = '';

  return (
    <Card className="border border-border/30 bg-white/5">
      <CardHeader>
        <CardTitle className="text-sm text-white/60">Shared Memories</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sorted.map((memory) => {
          const dateKey = memory.date.slice(0, 10);
          const showHeader = dateKey !== lastDateKey;
          lastDateKey = dateKey;

          return (
            <div key={memory.id}>
              {showHeader && (
                <TimelineDateHeader dateKey={dateKey} sticky={false} className="mx-0 mb-2 rounded-lg overflow-hidden" />
              )}
              <div className="rounded border border-primary/20 bg-black/50 p-3 text-sm text-white/80 flex gap-3">
                <TimelineInlineDate iso={memory.date} size="sm" showTime={false} />
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-primary">{memory.title}</div>
                  {memory.summary && <p className="text-white/60 mt-1">{memory.summary}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
