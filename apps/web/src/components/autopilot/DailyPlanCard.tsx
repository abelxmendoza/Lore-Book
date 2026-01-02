import { useState } from 'react';
import { AlarmClock, ChevronDown, Flame, Sparkles } from 'lucide-react';

import type { DailyRecommendation, RiskAlert } from '../../hooks/useAutopilot';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export type DailyPlanCardProps = {
  plan?: DailyRecommendation | null;
  focusWindow?: RiskAlert | null;
  loading?: boolean;
};

export const DailyPlanCard = ({ plan, focusWindow, loading }: DailyPlanCardProps) => {
  const [showEvidence, setShowEvidence] = useState(false);
  const tasks = plan?.suggested_tasks ?? [];

  return (
    <Card className="bg-gradient-to-br from-[#0b0013] via-[#120018] to-[#210014] border border-purple-800/40 shadow-[0_0_25px_rgba(192,38,211,0.25)]">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-fuchsia-400" />
          <CardTitle className="text-fuchsia-100">Daily Autopilot</CardTitle>
        </div>
        {plan && <Badge className="bg-red-500/20 text-red-100 border border-red-500/50">Urgency: {plan.urgency}</Badge>}
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-white/80">
        {loading && <p className="text-white/50">Synthesizing guidance…</p>}
        {!loading && plan && (
          <>
            <p className="leading-relaxed text-white/90">{plan.description}</p>
            <div className="rounded-xl border border-purple-700/60 bg-black/30 p-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-fuchsia-200">
                <AlarmClock className="h-4 w-4" />
                Focus Window
              </div>
              <p className="mt-1 text-[13px] text-white/80">
                {focusWindow?.evidence?.[0] ?? 'No focus timing detected yet.'}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-fuchsia-200">
                <span>Suggested Tasks</span>
                <span className="text-white/60">{tasks.length} queued</span>
              </div>
              <div className="mt-2 space-y-2">
                {tasks.map((task, index) => (
                  <div
                    key={`${task.title}-${index}`}
                    className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 shadow-inner"
                  >
                    <div className="flex items-center justify-between text-white">
                      <span className="font-medium">{task.title ?? 'Untitled Task'}</span>
                      {task.priority !== undefined && (
                        <Badge className="bg-red-600/30 text-red-100 border border-red-500/50">P{task.priority}</Badge>
                      )}
                    </div>
                    {task.due_date && <p className="text-[11px] text-white/60">Due {new Date(task.due_date).toLocaleDateString()}</p>}
                  </div>
                ))}
                {tasks.length === 0 && <p className="text-white/50">No tasks prioritized.</p>}
              </div>
            </div>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-purple-700/50 bg-purple-900/30 px-3 py-2 text-left text-xs text-white/80 hover:border-fuchsia-400"
              onClick={() => setShowEvidence((prev) => !prev)}
            >
              <span className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-red-300" /> Evidence
              </span>
              <ChevronDown className={`h-4 w-4 transition ${showEvidence ? 'rotate-180' : ''}`} />
            </button>
            {showEvidence && (
              <ul className="space-y-1 rounded-lg border border-purple-800/60 bg-black/40 p-3 text-xs text-white/70">
                {plan.evidence.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {!loading && !plan && <p className="text-white/50">No plan available.</p>}
      </CardContent>
    </Card>
  );
};
