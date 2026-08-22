import type { CharacterMemory } from '../../api/characters';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { TimelineDateHeader, TimelineInlineDate } from '../timeline/TimelineDateDisplay';

function occurrenceIso(memory: CharacterMemory): string | null {
  if (memory.occurrenceStatus === 'unresolved') return null;
  const iso = memory.occurredAt ?? memory.date;
  return iso && Number.isFinite(Date.parse(iso)) ? iso : null;
}

export const CharacterSharedTimeline = ({ memories }: { memories: CharacterMemory[] }) => {
  const sorted = [...memories].sort((a, b) => {
    const aOcc = occurrenceIso(a);
    const bOcc = occurrenceIso(b);
    if (aOcc && bOcc) return Date.parse(bOcc) - Date.parse(aOcc);
    if (aOcc) return -1;
    if (bOcc) return 1;
    return 0;
  });

  let lastDateKey = '';

  return (
    <Card className="border border-border/30 bg-white/5">
      <CardHeader>
        <CardTitle className="text-sm text-white/60">Shared Memories</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sorted.map((memory) => {
          const iso = occurrenceIso(memory);
          const dateKey = iso?.slice(0, 10) ?? '';
          const showHeader = Boolean(dateKey) && dateKey !== lastDateKey;
          if (dateKey) lastDateKey = dateKey;

          return (
            <div key={memory.id}>
              {showHeader && (
                <TimelineDateHeader dateKey={dateKey} sticky={false} className="mx-0 mb-2 rounded-lg overflow-hidden" />
              )}
              <div className="rounded border border-primary/20 bg-black/50 p-3 text-sm text-white/80 flex gap-3">
                {iso ? (
                  <TimelineInlineDate iso={iso} size="sm" showTime={false} />
                ) : (
                  <span className="text-xs text-white/40 shrink-0">Date unknown</span>
                )}
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-primary">{memory.title}</div>
                  {memory.summary && <p className="text-white/60 mt-1">{memory.summary}</p>}
                  {memory.recordedAt && (
                    <p className="text-[11px] text-white/40 mt-1">
                      Recorded {new Date(memory.recordedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
