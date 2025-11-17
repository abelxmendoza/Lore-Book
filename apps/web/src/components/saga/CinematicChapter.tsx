import type { SagaChapter } from '../../api/saga';
import { Card, CardContent } from '../ui/card';

export const CinematicChapter = ({ chapter }: { chapter: SagaChapter }) => (
  <Card className="border-border/30 bg-white/5">
    <CardContent className="space-y-1 p-4">
      <div className="flex items-center justify-between text-xs uppercase text-white/60">
        <span>Chapter</span>
        {chapter.turningPoint && <span className="text-secondary">Turning Point</span>}
      </div>
      <div className="text-lg font-semibold text-foreground">{chapter.title}</div>
      <p className="text-white/70">{chapter.summary}</p>
    </CardContent>
  </Card>
);
