import { useState } from 'react';
import { Compass, Rocket, Shield, Zap } from 'lucide-react';

import type { WeeklyStrategy } from '../../hooks/useAutopilot';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export const WeeklyStrategyView = ({ strategy }: { strategy?: WeeklyStrategy | null }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border border-purple-800/40 bg-gradient-to-br from-[#0e001f] via-[#130026] to-[#20001f] shadow-[0_0_20px_rgba(168,85,247,0.2)]">
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-purple-300" />
          <CardTitle className="text-purple-100">Weekly Strategy</CardTitle>
        </div>
        {strategy && <Badge className="bg-purple-900/40 text-purple-100 border border-purple-600/70">{strategy.focus_areas.length} focus</Badge>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-white/80">
        {strategy ? (
          <>
            <p className="text-white/90">{strategy.description}</p>
            <div className="flex flex-wrap gap-2">
              {strategy.focus_areas.map((area) => (
                <Badge key={area} className="bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-500/40">
                  <Rocket className="mr-1 h-3 w-3" /> {area}
                </Badge>
              ))}
              {strategy.focus_areas.length === 0 && (
                <Badge className="bg-purple-700/30 text-purple-100 border border-purple-500/40">Calibrate focus</Badge>
              )}
            </div>
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="flex items-center gap-2 text-xs text-white/70 hover:text-fuchsia-200"
            >
              <Shield className="h-4 w-4" /> Evidence {expanded ? '▲' : '▼'}
            </button>
            {expanded && (
              <ul className="space-y-1 rounded-lg border border-purple-700/50 bg-black/40 p-3 text-xs text-white/70">
                {strategy.evidence.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Zap className="mt-0.5 h-3 w-3 text-fuchsia-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-white/50">No strategy generated yet.</p>
        )}
      </CardContent>
    </Card>
  );
};
