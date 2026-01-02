import type { MonthlyCorrection } from '../../hooks/useAutopilot';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export const MonthlyCorrectionView = ({ correction }: { correction?: MonthlyCorrection | null }) => (
  <Card className="border border-rose-800/40 bg-gradient-to-br from-[#1a000f] via-[#230016] to-[#2b0018] shadow-[0_0_18px_rgba(244,63,94,0.25)]">
    <CardHeader className="flex items-center justify-between">
      <CardTitle className="text-rose-100">Monthly Course Correction</CardTitle>
      {correction && <Badge className="bg-rose-600/20 text-rose-100 border border-rose-500/50">Confidence {correction.confidence}</Badge>}
    </CardHeader>
    <CardContent className="space-y-3 text-sm text-white/80">
      {correction ? (
        <>
          <p className="text-white/90">{correction.description}</p>
          <div className="space-y-2">
            {correction.adjustments.map((adjustment, idx) => (
              <div key={idx} className="rounded-lg border border-rose-700/50 bg-rose-500/10 px-3 py-2 text-white/80">
                {adjustment}
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-rose-900/60 bg-black/40 p-3 text-xs text-white/70">
            <p className="text-rose-200">Evidence</p>
            <ul className="mt-1 space-y-1">
              {correction.evidence.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-rose-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <p className="text-white/50">No monthly adjustments yet.</p>
      )}
    </CardContent>
  </Card>
);
