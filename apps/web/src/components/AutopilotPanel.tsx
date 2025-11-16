import { RefreshCw } from 'lucide-react';

import { useAutopilot } from '../hooks/useAutopilot';
import { Button } from './ui/button';
import { DailyPlanCard } from './autopilot/DailyPlanCard';
import { WeeklyStrategyView } from './autopilot/WeeklyStrategyView';
import { MonthlyCorrectionView } from './autopilot/MonthlyCorrectionView';
import { RiskAlerts } from './autopilot/RiskAlerts';
import { MomentumGraph } from './autopilot/MomentumGraph';
import { ArcTransitionGuide } from './autopilot/ArcTransitionGuide';

export const AutopilotPanel = () => {
  const { dailyPlan, weeklyStrategy, monthlyCorrection, transition, alerts, momentum, loading, error, refresh } = useAutopilot();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-purple-900/60 bg-gradient-to-r from-[#0b0016] via-[#120028] to-[#1a0024] p-4 shadow-[0_0_30px_rgba(147,51,234,0.25)]">
        <div>
          <p className="text-xs uppercase tracking-wide text-fuchsia-200">Autopilot Engine</p>
          <h2 className="text-xl font-semibold text-white">AI Life Guidance</h2>
          <p className="text-sm text-white/60">Pulling insights, arcs, identity patterns, and tasks into actionable guidance.</p>
        </div>
        <Button variant="secondary" onClick={() => refresh()} disabled={loading} leftIcon={<RefreshCw className="h-4 w-4" />}>
          Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <DailyPlanCard plan={dailyPlan} focusWindow={alerts?.focus_window} loading={loading} />
          <WeeklyStrategyView strategy={weeklyStrategy} />
          <ArcTransitionGuide guidance={transition} />
        </div>
        <div className="space-y-4">
          <RiskAlerts alerts={alerts} />
          <MomentumGraph momentum={momentum} />
          <MonthlyCorrectionView correction={monthlyCorrection} />
        </div>
      </div>
    </div>
  );
};
