import { useSaga } from '../../../hooks/useSaga';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { ArcCurveCanvas } from './ArcCurveCanvas';
import { CinematicChapter } from './CinematicChapter';
import { KeyMomentCard } from './KeyMomentCard';

export const SagaScreen = () => {
  const { saga } = useSaga();

  if (!saga) return <p className="text-white/60">Loading saga…</p>;

  const storylines = saga.eras.flatMap((era) => era.chapters.flatMap((chapter) => chapter.storylines));

  return (
    <Card className="neon-surface border border-primary/30">
      <CardHeader>
        <CardTitle className="font-techno text-lg">{saga.era}</CardTitle>
        <p className="text-xs text-white/60">High-level arc overview</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ArcCurveCanvas arcs={saga.currentStorylines} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {storylines.map((storyline) => (
            <CinematicChapter key={storyline.id} chapter={storyline} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {storylines.slice(0, 4).map((storyline) => (
            <KeyMomentCard key={storyline.id} title={storyline.title} summary={storyline.summary} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
