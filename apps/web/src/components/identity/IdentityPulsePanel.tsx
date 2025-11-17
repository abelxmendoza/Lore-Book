import { useIdentityPulse } from '../../hooks/useIdentityPulse';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { DriftWarnings } from './DriftWarnings';
import { EmotionalTrajectoryGraph } from './EmotionalTrajectoryGraph';
import { IdentityGauge } from './IdentityGauge';
import { MotifBars } from './MotifBars';

export const IdentityPulsePanel = () => {
  const { pulse, loading } = useIdentityPulse();

  return (
    <Card className="neon-surface border border-primary/30">
      <CardHeader>
        <CardTitle className="font-techno text-lg">Identity Pulse</CardTitle>
        <p className="text-xs text-white/50">Active persona signature</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p className="text-sm text-white/60">Calibrating identity sensors…</p>}
        {pulse && (
          <>
            <div className="text-xl font-semibold text-primary">{pulse.persona}</div>
            <MotifBars motifs={pulse.motifs} />
            <IdentityGauge stability={pulse.stability} />
            <EmotionalTrajectoryGraph points={pulse.emotionTrajectory} />
            <DriftWarnings warnings={pulse.driftWarnings} />
          </>
        )}
      </CardContent>
    </Card>
  );
};
