import { ArrowUpRight, Brain, CheckCircle, Lightbulb } from 'lucide-react';

export type Insight = {
  title?: string;
  description: string;
  confidence: number;
  evidence?: string[];
  action_suggestion?: string;
  pattern?: string;
  motif?: string;
  variables?: string[];
  period?: string;
  horizon?: string;
};

export const InsightCard = ({ insight }: { insight: Insight }) => {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-gradient-to-b from-slate-900/60 to-black p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm uppercase tracking-wide text-white/60">Insight</span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
          <CheckCircle className="h-3 w-3" />
          <span>{Math.round(insight.confidence * 100)}%</span>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-base font-semibold text-white">{insight.title ?? insight.pattern ?? insight.motif ?? 'Signal'}</p>
        <p className="text-sm text-white/70">{insight.description}</p>
      </div>

      {insight.evidence && insight.evidence.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-black/40 p-3 text-xs text-white/60">
          <p className="mb-2 flex items-center gap-1 text-white/70">
            <Lightbulb className="h-4 w-4 text-amber-400" /> Evidence
          </p>
          <ul className="space-y-1">
            {insight.evidence.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      )}

      {insight.action_suggestion && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          <ArrowUpRight className="h-4 w-4" />
          <span>{insight.action_suggestion}</span>
        </div>
      )}
    </div>
  );
};
