import { AlertTriangle, BatteryCharging, Brain, ChevronDown } from 'lucide-react';
import { useState } from 'react';

import type { RiskAlert } from '../../hooks/useAutopilot';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

const severityColor = (level: number) => {
  if (level >= 4) return 'bg-red-600/20 text-red-100 border-red-500/60';
  if (level >= 3) return 'bg-orange-500/20 text-orange-100 border-orange-400/60';
  return 'bg-emerald-500/15 text-emerald-100 border-emerald-400/60';
};

export const RiskAlerts = ({ alerts }: { alerts?: Record<string, RiskAlert> }) => {
  const [expanded, setExpanded] = useState(false);
  const alertList = Object.entries(alerts ?? {});

  return (
    <Card className="border border-red-800/40 bg-[#0f000d] shadow-[0_0_18px_rgba(248,113,113,0.25)]">
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-red-100">
          <AlertTriangle className="h-5 w-5" />
          <CardTitle className="text-red-100">Autopilot Alerts</CardTitle>
        </div>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-white/70 hover:text-red-200"
          onClick={() => setExpanded((prev) => !prev)}
        >
          Evidence <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-white/80">
        {alertList.length === 0 && <p className="text-white/50">No alerts detected.</p>}
        {alertList.map(([key, alert]) => (
          <div key={key} data-variant={alert.alert_type} className={`rounded-lg border px-3 py-2 ${severityColor(alert.risk_level)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                {alert.alert_type === 'burnout_risk' ? (
                  <BatteryCharging className="h-4 w-4" />
                ) : alert.alert_type === 'slump_cycle' ? (
                  <Brain className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <span className="capitalize">{alert.alert_type.replace('_', ' ')}</span>
              </div>
              <Badge className="bg-black/40 text-white">Lvl {alert.risk_level}</Badge>
            </div>
            {expanded && (
              <ul className="mt-2 space-y-1 text-xs text-white/70">
                {alert.evidence.map((item, idx) => (
                  <li key={idx}>• {item}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
