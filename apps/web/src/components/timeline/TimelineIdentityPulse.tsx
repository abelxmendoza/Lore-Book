import { useIdentityPulse } from '../../hooks/useIdentityPulse';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { MotifBars } from '../identity/MotifBars';

export const TimelineIdentityPulse = () => {
  const { pulse } = useIdentityPulse();

  if (!pulse) return null;

  return (
    <Card className="border border-primary/30 bg-black/30">
      <CardHeader>
        <CardTitle className="text-sm text-cyan">Identity Pulse</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-lg font-semibold text-primary">{pulse.persona}</div>
        <MotifBars motifs={pulse.motifs} />
      </CardContent>
    </Card>
  );
};
