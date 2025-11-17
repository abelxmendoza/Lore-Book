import type { CharacterMemory } from '../../api/characters';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export const CharacterSharedTimeline = ({ memories }: { memories: CharacterMemory[] }) => (
  <Card className="border border-border/30 bg-white/5">
    <CardHeader>
      <CardTitle className="text-sm text-white/60">Shared Memories</CardTitle>
    </CardHeader>
    <CardContent className="space-y-2">
      {memories.map((memory) => (
        <div key={memory.id} className="rounded border border-primary/20 bg-black/50 p-3 text-sm text-white/80">
          <div className="text-xs uppercase text-white/50">{new Date(memory.date).toDateString()}</div>
          <div className="text-lg font-semibold text-primary">{memory.title}</div>
          {memory.summary && <p className="text-white/60">{memory.summary}</p>}
        </div>
      ))}
    </CardContent>
  </Card>
);
