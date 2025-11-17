import { useContinuity } from '../../hooks/useContinuity';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { CanonFactsList } from './CanonFactsList';
import { ConflictList } from './ConflictList';
import { ContinuityGraph } from './ContinuityGraph';
import { MergeSuggestionDialog } from './MergeSuggestionDialog';
import { StabilityMeter } from './StabilityMeter';

export const ContinuityPanel = () => {
  const { snapshot, mergeSuggestions } = useContinuity();

  return (
    <Card className="neon-surface border border-primary/30">
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="font-techno text-lg">Continuity</CardTitle>
          <p className="text-xs text-white/60">Canon stability and conflicts</p>
        </div>
        {snapshot && <StabilityMeter score={snapshot.stability} />}
      </CardHeader>
      <CardContent className="space-y-4">
        {snapshot && (
          <>
            <CanonFactsList facts={snapshot.facts} />
            <ConflictList conflicts={snapshot.conflicts} />
            <ContinuityGraph facts={snapshot.facts} conflicts={snapshot.conflicts} />
          </>
        )}
        <MergeSuggestionDialog suggestions={mergeSuggestions} />
      </CardContent>
    </Card>
  );
};
