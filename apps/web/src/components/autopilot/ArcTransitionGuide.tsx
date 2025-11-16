import { Sparkles, SwitchCamera } from 'lucide-react';

import type { TransitionGuidance } from '../../hooks/useAutopilot';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export const ArcTransitionGuide = ({ guidance }: { guidance?: TransitionGuidance | null }) => (
  <Card className="border border-indigo-800/40 bg-gradient-to-br from-[#050014] via-[#0c0022] to-[#19003a] shadow-[0_0_16px_rgba(99,102,241,0.25)]">
    <CardHeader className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <SwitchCamera className="h-5 w-5 text-indigo-300" />
        <CardTitle className="text-indigo-100">Arc Transition</CardTitle>
      </div>
      {guidance?.identity_shift_detected && (
        <Badge className="bg-indigo-600/30 text-indigo-100 border border-indigo-500/60">Shift Detected</Badge>
      )}
    </CardHeader>
    <CardContent className="space-y-3 text-sm text-white/80">
      {guidance ? (
        <>
          <p className="text-white/90">{guidance.description}</p>
          <div className="rounded-lg border border-indigo-800/50 bg-black/30 p-3">
            <p className="text-xs uppercase tracking-wide text-indigo-200">Recommended Behavior</p>
            <ul className="mt-2 space-y-1 text-white/80">
              {guidance.recommended_behavior.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 text-indigo-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-indigo-900/60 bg-black/40 p-3 text-xs text-white/70">
            <p className="text-indigo-200">Evidence</p>
            <ul className="mt-1 space-y-1">
              {guidance.evidence.map((item, idx) => (
                <li key={idx}>• {item}</li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <p className="text-white/50">No transition guidance yet.</p>
      )}
    </CardContent>
  </Card>
);
