import { Activity } from 'lucide-react';

import type { MomentumSignal } from '../../hooks/useAutopilot';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export const MomentumGraph = ({ momentum }: { momentum?: MomentumSignal | null }) => {
  const score = momentum?.momentum_score ?? 0;

  return (
    <Card className="border border-fuchsia-800/40 bg-gradient-to-br from-[#0a0018] via-[#14002d] to-[#1a002a] shadow-[0_0_16px_rgba(192,132,252,0.25)]">
      <CardHeader className="flex items-center gap-2 text-fuchsia-100">
        <Activity className="h-5 w-5" />
        <CardTitle className="text-fuchsia-100">Momentum</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-white/80">
        {momentum ? <p className="text-white/90">{momentum.description}</p> : <p className="text-white/50">No momentum yet.</p>}
        <div className="rounded-lg border border-fuchsia-700/60 bg-black/30 p-3">
          <div className="flex items-center justify-between text-xs text-white/70">
            <span className="uppercase tracking-wide">{momentum?.skill_area ?? 'general'}</span>
            <span>{Math.round(score * 100)}%</span>
          </div>
          <div className="mt-2 h-3 rounded-full bg-fuchsia-950/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-500 via-fuchsia-500 to-purple-400 shadow-[0_0_12px_rgba(192,38,211,0.4)]"
              style={{ width: `${Math.min(100, Math.max(5, score * 100))}%` }}
            />
          </div>
          {momentum?.evidence && (
            <ul className="mt-2 space-y-1 text-[11px] text-white/60">
              {momentum.evidence.map((item, idx) => (
                <li key={idx}>• {item}</li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
