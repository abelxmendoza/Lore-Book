import { useSaga } from '../../hooks/useSaga';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ArcCurveCanvas } from './ArcCurveCanvas';
import { CinematicChapter } from './CinematicChapter';
import { KeyMomentCard } from './KeyMomentCard';

export const SagaScreen = () => {
  const { saga } = useSaga();

  if (!saga) return <p className="text-white/60">Loading saga…</p>;

  return (
    <Card className="neon-surface border border-primary/30">
      <CardHeader>
        <CardTitle className="font-techno text-lg">{saga.era}</CardTitle>
        <p className="text-xs text-white/60">High-level arc overview</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ArcCurveCanvas arcs={saga.arcs} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {saga.chapters.map((chapter) => (
            <CinematicChapter key={chapter.id} chapter={chapter} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {saga.chapters.slice(0, 4).map((chapter) => (
            <KeyMomentCard key={chapter.id} title={chapter.title} summary={chapter.summary} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
